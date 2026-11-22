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
import { createBannerAction, updateBannerAction, setBannerStatusAction } from "@/actions/banners";
import { listPublicBanners } from "@/services/banners";
import Banner from "@/models/Banner";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function bannerForm(overrides) {
  return form(
    Object.assign(
      {
        title: "Winter drive",
        text: "Bring your old books to the drop point",
        linkUrl: "/rewards",
        linkLabel: "See rewards",
        startDate: "",
        endDate: "",
        sortOrder: "10",
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

function makeBanner(overrides) {
  return Banner.create(
    Object.assign({ title: "Existing banner", text: "A banner that already exists", status: "DRAFT" }, overrides || {})
  );
}

describe("createBannerAction", () => {
  it("saves a draft with a safe link and an audit entry", async () => {
    const admin = await asContentManager();
    const out = await run(() => createBannerAction(null, bannerForm()));
    expect(out.result.success).toBeTruthy();
    const saved = await Banner.findOne({}).lean();
    expect(saved.status).toBe("DRAFT");
    expect(saved.linkUrl).toBe("/rewards");
    expect(saved.linkLabel).toBe("See rewards");
    expect(saved.sortOrder).toBe(10);
    expect(String(saved.createdBy)).toBe(String(admin._id));
    expect(await AuditLog.countDocuments({ action: "banner.create" })).toBe(1);
  });

  it("uses a default label and accepts a banner without a link", async () => {
    await asContentManager();
    await run(() => createBannerAction(null, bannerForm({ linkLabel: "" })));
    await run(() => createBannerAction(null, bannerForm({ title: "No link banner", linkUrl: "", linkLabel: "Ignored" })));
    const saved = await Banner.find({}).sort({ _id: 1 }).lean();
    expect(saved[0].linkLabel).toBe("Learn more");
    expect(saved[1].linkUrl).toBe("");
    expect(saved[1].linkLabel).toBe("");
  });

  it("refuses unsafe links and accepts a full https address", async () => {
    await asContentManager();
    for (const bad of ["javascript:alert(1)", "//evil.example", "http://example.org", "https://user:pw@example.org", "example.org"]) {
      const out = await run(() => createBannerAction(null, bannerForm({ linkUrl: bad })));
      expect(out.result.error).toMatch(/link must be/i);
    }
    expect(await Banner.countDocuments({})).toBe(0);
    const ok = await run(() => createBannerAction(null, bannerForm({ linkUrl: "https://example.org/page" })));
    expect(ok.result.success).toBeTruthy();
  });

  it("refuses short text, a long link label and bad dates", async () => {
    await asContentManager();
    const a = await run(() => createBannerAction(null, bannerForm({ title: "ab" })));
    expect(a.result.error).toMatch(/title/i);
    const b = await run(() => createBannerAction(null, bannerForm({ text: "too short" })));
    expect(b.result.error).toMatch(/text/i);
    const c = await run(() => createBannerAction(null, bannerForm({ linkLabel: "x".repeat(31) })));
    expect(c.result.error).toMatch(/label/i);
    const d = await run(() => createBannerAction(null, bannerForm({ startDate: "2026-02-30" })));
    expect(d.result.error).toMatch(/start date/i);
    const e = await run(() => createBannerAction(null, bannerForm({ startDate: "2026-12-10", endDate: "2026-12-01" })));
    expect(e.result.error).toMatch(/must not be before/i);
    expect(await Banner.countDocuments({})).toBe(0);
  });

  it("refuses every role without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createBannerAction(null, bannerForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createBannerAction(null, bannerForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Banner.countDocuments({})).toBe(0);
  });
});

describe("updateBannerAction", () => {
  function updateForm(id, overrides) {
    return bannerForm(Object.assign({ bannerId: String(id), title: "Renamed banner" }, overrides || {}));
  }

  it("edits a draft", async () => {
    const b = await makeBanner();
    await asContentManager();
    const out = await run(() => updateBannerAction(null, updateForm(b._id)));
    expect(out.result.success).toBeTruthy();
    expect((await Banner.findById(b._id).lean()).title).toBe("Renamed banner");
    expect(await AuditLog.countDocuments({ action: "banner.update" })).toBe(1);
  });

  it("does not edit a published or archived banner", async () => {
    const live = await makeBanner({ status: "PUBLISHED" });
    const old = await makeBanner({ status: "ARCHIVED" });
    await asContentManager();
    for (const b of [live, old]) {
      const out = await run(() => updateBannerAction(null, updateForm(b._id)));
      expect(out.result.error).toMatch(/only a draft/i);
      expect((await Banner.findById(b._id).lean()).title).toBe("Existing banner");
    }
  });

  it("refuses an unsafe link, a bad id and a role without permission", async () => {
    const b = await makeBanner();
    await asContentManager();
    const a = await run(() => updateBannerAction(null, updateForm(b._id, { linkUrl: "javascript:alert(1)" })));
    expect(a.result.error).toMatch(/link must be/i);
    const c = await run(() => updateBannerAction(null, updateForm("nope")));
    expect(c.result.error).toMatch(/invalid/i);
    const other = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(other);
    const d = await run(() => updateBannerAction(null, updateForm(b._id)));
    expect(d.result.error).toMatch(/permission/i);
  });
});

describe("setBannerStatusAction", () => {
  function statusForm(id, target) {
    return form({ bannerId: String(id), target: target });
  }

  it("publishes a draft and records who published it", async () => {
    const b = await makeBanner();
    const admin = await asContentManager();
    const out = await run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Banner.findById(b._id).lean();
    expect(saved.status).toBe("PUBLISHED");
    expect(String(saved.publishedBy)).toBe(String(admin._id));
    expect(await AuditLog.countDocuments({ action: "banner.status.published" })).toBe(1);
    const again = await run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses to publish a banner that has already ended", async () => {
    const b = await makeBanner({ startDate: "2020-01-01", endDate: "2020-01-31" });
    await asContentManager();
    const out = await run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED")));
    expect(out.result.error).toMatch(/already ended/i);
    expect((await Banner.findById(b._id).lean()).status).toBe("DRAFT");
  });

  it("lets only one request win when two publish requests arrive at the same time", async () => {
    const b = await makeBanner();
    await asContentManager();
    const results = await Promise.all([
      run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED"))),
      run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "banner.status.published" })).toBe(1);
  });

  it("refuses a resident, an operations manager and a visitor", async () => {
    const b = await makeBanner();
    for (const role of ["RESIDENT", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setBannerStatusAction(null, statusForm(b._id, "PUBLISHED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Banner.findById(b._id).lean()).status).toBe("DRAFT");
  });
});

describe("listPublicBanners", () => {
  const NOW = new Date("2026-11-20T12:00:00Z");

  it("lists only published banners that are running now, in the given order", async () => {
    await makeBanner({ title: "Second", status: "PUBLISHED", sortOrder: 20, publishedAt: new Date() });
    await makeBanner({ title: "First", status: "PUBLISHED", sortOrder: 5, publishedAt: new Date() });
    await makeBanner({ title: "Upcoming", status: "PUBLISHED", startDate: "2026-12-01", publishedAt: new Date() });
    await makeBanner({ title: "Ended", status: "PUBLISHED", endDate: "2026-10-01", publishedAt: new Date() });
    await makeBanner({ title: "Draft", status: "DRAFT" });
    await makeBanner({ title: "Archived", status: "ARCHIVED" });
    await makeBanner({ title: "Deleted", status: "PUBLISHED", deletedAt: new Date(), publishedAt: new Date() });

    const list = await listPublicBanners(NOW);
    expect(list.map((b) => b.title)).toEqual(["First", "Second"]);
  });

  it("shows at most three banners", async () => {
    for (let i = 1; i <= 5; i++) {
      await makeBanner({ title: "Banner " + i, status: "PUBLISHED", sortOrder: i, publishedAt: new Date() });
    }
    const list = await listPublicBanners(NOW);
    expect(list.map((b) => b.title)).toEqual(["Banner 1", "Banner 2", "Banner 3"]);
  });

  it("drops an unsafe link stored directly in the database but still shows the banner", async () => {
    await makeBanner({ title: "Bad link", status: "PUBLISHED", linkUrl: "javascript:alert(1)", linkLabel: "Click", publishedAt: new Date() });
    await makeBanner({ title: "Good link", status: "PUBLISHED", sortOrder: 200, linkUrl: "/rewards", publishedAt: new Date() });
    const list = await listPublicBanners(NOW);
    const bad = list.find((b) => b.title === "Bad link");
    const good = list.find((b) => b.title === "Good link");
    expect(bad.linkUrl).toBe("");
    expect(bad.linkLabel).toBe("");
    expect(good.linkUrl).toBe("/rewards");
    expect(good.linkLabel).toBe("Learn more");
    expect(good.internal).toBe(true);
  });

  it("returns an empty list when nothing is published", async () => {
    expect(await listPublicBanners(NOW)).toEqual([]);
  });
});
