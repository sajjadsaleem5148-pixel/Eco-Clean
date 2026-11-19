import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createCampaignAction, updateCampaignAction, setCampaignStatusAction } from "@/actions/campaigns";
import { listPublicCampaigns } from "@/services/campaigns";
import Campaign from "@/models/Campaign";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function campaignForm(overrides) {
  return form(
    Object.assign(
      {
        title: "Clean Street Week",
        summary: "Join us for a week of street cleaning",
        body: "Bring gloves and a bag.",
        startDate: "",
        endDate: "",
      },
      overrides || {}
    )
  );
}

async function asContentManager() {
  const user = await makeUser({ role: "CONTENT_MANAGER" });
  signInAs(user);
  return user;
}

function makeCampaign(overrides) {
  return Campaign.create(
    Object.assign({ title: "Existing campaign", summary: "A campaign that already exists", status: "DRAFT" }, overrides || {})
  );
}

describe("createCampaignAction", () => {
  it("saves a draft and records an audit entry", async () => {
    const admin = await asContentManager();
    const out = await run(() => createCampaignAction(null, campaignForm({ startDate: "2026-12-01", endDate: "2026-12-07" })));
    expect(out.result.success).toBeTruthy();
    const saved = await Campaign.findOne({}).lean();
    expect(saved.status).toBe("DRAFT");
    expect(saved.startDate).toBe("2026-12-01");
    expect(String(saved.createdBy)).toBe(String(admin._id));
    expect(await AuditLog.countDocuments({ action: "campaign.create" })).toBe(1);
  });

  it("refuses short text and bad dates", async () => {
    await asContentManager();
    const a = await run(() => createCampaignAction(null, campaignForm({ title: "ab" })));
    expect(a.result.error).toMatch(/title/i);
    const b = await run(() => createCampaignAction(null, campaignForm({ summary: "too short" })));
    expect(b.result.error).toMatch(/summary/i);
    const c = await run(() => createCampaignAction(null, campaignForm({ startDate: "2026-02-30" })));
    expect(c.result.error).toMatch(/start date/i);
    const d = await run(() =>
      createCampaignAction(null, campaignForm({ startDate: "2026-12-10", endDate: "2026-12-01" }))
    );
    expect(d.result.error).toMatch(/must not be before/i);
    expect(await Campaign.countDocuments({})).toBe(0);
  });

  it("refuses every role without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createCampaignAction(null, campaignForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createCampaignAction(null, campaignForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Campaign.countDocuments({})).toBe(0);
  });
});

describe("updateCampaignAction", () => {
  function updateForm(id, overrides) {
    return campaignForm(Object.assign({ campaignId: String(id), title: "Renamed campaign" }, overrides || {}));
  }

  it("edits a draft", async () => {
    const c = await makeCampaign();
    await asContentManager();
    const out = await run(() => updateCampaignAction(null, updateForm(c._id)));
    expect(out.result.success).toBeTruthy();
    expect((await Campaign.findById(c._id).lean()).title).toBe("Renamed campaign");
    expect(await AuditLog.countDocuments({ action: "campaign.update" })).toBe(1);
  });

  it("does not edit a published or archived campaign", async () => {
    const live = await makeCampaign({ status: "PUBLISHED" });
    const old = await makeCampaign({ status: "ARCHIVED" });
    await asContentManager();
    for (const c of [live, old]) {
      const out = await run(() => updateCampaignAction(null, updateForm(c._id)));
      expect(out.result.error).toMatch(/only a draft/i);
      expect((await Campaign.findById(c._id).lean()).title).toBe("Existing campaign");
    }
  });

  it("refuses a bad id and a role without permission", async () => {
    const c = await makeCampaign();
    await asContentManager();
    const a = await run(() => updateCampaignAction(null, updateForm("nope")));
    expect(a.result.error).toMatch(/invalid/i);
    const other = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(other);
    const b = await run(() => updateCampaignAction(null, updateForm(c._id)));
    expect(b.result.error).toMatch(/permission/i);
  });
});

describe("setCampaignStatusAction", () => {
  function statusForm(id, target) {
    return form({ campaignId: String(id), target: target });
  }

  it("publishes a draft and records who published it", async () => {
    const c = await makeCampaign();
    const admin = await asContentManager();
    const out = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Campaign.findById(c._id).lean();
    expect(saved.status).toBe("PUBLISHED");
    expect(String(saved.publishedBy)).toBe(String(admin._id));
    expect(saved.publishedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "campaign.status.published" })).toBe(1);

    const again = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses to publish a campaign that has already ended", async () => {
    const c = await makeCampaign({ startDate: "2020-01-01", endDate: "2020-01-31" });
    await asContentManager();
    const out = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
    expect(out.result.error).toMatch(/already ended/i);
    expect((await Campaign.findById(c._id).lean()).status).toBe("DRAFT");
  });

  it("moves a published campaign back to draft and archives it", async () => {
    const c = await makeCampaign({ status: "PUBLISHED" });
    await asContentManager();
    const back = await run(() => setCampaignStatusAction(null, statusForm(c._id, "DRAFT")));
    expect(back.result.success).toBeTruthy();
    const archive = await run(() => setCampaignStatusAction(null, statusForm(c._id, "ARCHIVED")));
    expect(archive.result.success).toBeTruthy();
    expect((await Campaign.findById(c._id).lean()).status).toBe("ARCHIVED");
    const published = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
    expect(published.result.error).toMatch(/cannot be moved/i);
  });

  it("lets only one request win when two publish requests arrive at the same time", async () => {
    const c = await makeCampaign();
    await asContentManager();
    const results = await Promise.all([
      run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED"))),
      run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "campaign.status.published" })).toBe(1);
  });

  it("refuses a resident, an operations manager and a visitor", async () => {
    const c = await makeCampaign();
    for (const role of ["RESIDENT", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setCampaignStatusAction(null, statusForm(c._id, "PUBLISHED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Campaign.findById(c._id).lean()).status).toBe("DRAFT");
  });
});

describe("listPublicCampaigns", () => {
  const NOW = new Date("2026-11-20T12:00:00Z");

  it("lists only published campaigns that have not ended, running ones first", async () => {
    await makeCampaign({ title: "Upcoming one", status: "PUBLISHED", startDate: "2026-12-01", publishedAt: new Date() });
    await makeCampaign({ title: "Running one", status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000) });
    await makeCampaign({ title: "Ended one", status: "PUBLISHED", endDate: "2026-10-01", publishedAt: new Date() });
    await makeCampaign({ title: "Draft one", status: "DRAFT" });
    await makeCampaign({ title: "Archived one", status: "ARCHIVED" });
    await makeCampaign({ title: "Deleted one", status: "PUBLISHED", deletedAt: new Date() });

    const list = await listPublicCampaigns(NOW);
    expect(list.map((c) => c.title)).toEqual(["Running one", "Upcoming one"]);
    expect(list[0].phase).toBe("ACTIVE");
    expect(list[1].phase).toBe("UPCOMING");
  });

  it("returns an empty list when nothing is published", async () => {
    expect(await listPublicCampaigns(NOW)).toEqual([]);
  });
});
