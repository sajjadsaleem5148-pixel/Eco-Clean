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
import {
  createTestimonialAction,
  updateTestimonialAction,
  setTestimonialStatusAction,
} from "@/actions/testimonials";
import { listPublicTestimonials } from "@/services/testimonials";
import Testimonial from "@/models/Testimonial";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function testimonialForm(overrides) {
  return form(
    Object.assign(
      {
        quote: "The collectors are on time and always polite.",
        authorName: "Ayesha Khan",
        authorDetail: "Resident, Zone A",
        consentNote: "Written email on 2 Nov",
        consent: "yes",
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

function makeTestimonial(overrides) {
  return Testimonial.create(
    Object.assign(
      {
        quote: "An existing testimonial with enough words.",
        authorName: "Existing Person",
        consentConfirmed: true,
        consentNote: "Verbal, noted by staff",
        status: "DRAFT",
      },
      overrides || {}
    )
  );
}

describe("createTestimonialAction", () => {
  it("saves a draft with recorded consent and an audit entry that holds no name or quote", async () => {
    const admin = await asContentManager();
    const out = await run(() => createTestimonialAction(null, testimonialForm()));
    expect(out.result.success).toBeTruthy();
    const saved = await Testimonial.findOne({}).lean();
    expect(saved.status).toBe("DRAFT");
    expect(saved.consentConfirmed).toBe(true);
    expect(saved.consentNote).toBe("Written email on 2 Nov");
    expect(String(saved.createdBy)).toBe(String(admin._id));
    const logs = await AuditLog.find({ action: "testimonial.create" }).lean();
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0]);
    expect(text.includes("Ayesha")).toBe(false);
    expect(text.includes("collectors")).toBe(false);
  });

  it("refuses a testimonial without the consent tick", async () => {
    await asContentManager();
    const out = await run(() => createTestimonialAction(null, testimonialForm({ consent: undefined })));
    expect(out.result.error).toMatch(/agreed to be quoted/i);
    expect(await Testimonial.countDocuments({})).toBe(0);
  });

  it("refuses a short quote, a bad name, brackets and a missing consent note", async () => {
    await asContentManager();
    const a = await run(() => createTestimonialAction(null, testimonialForm({ quote: "too short" })));
    expect(a.result.error).toMatch(/quote/i);
    const b = await run(() => createTestimonialAction(null, testimonialForm({ authorName: "!!!" })));
    expect(b.result.error).toMatch(/valid name/i);
    const c = await run(() => createTestimonialAction(null, testimonialForm({ quote: "This quote has <script> inside it." })));
    expect(c.result.error).toMatch(/< or >/);
    const d = await run(() => createTestimonialAction(null, testimonialForm({ consentNote: "ok" })));
    expect(d.result.error).toMatch(/consent/i);
    const e = await run(() => createTestimonialAction(null, testimonialForm({ authorDetail: "<i>x</i>" })));
    expect(e.result.error).toMatch(/role or place/i);
    expect(await Testimonial.countDocuments({})).toBe(0);
  });

  it("refuses every role without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createTestimonialAction(null, testimonialForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createTestimonialAction(null, testimonialForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Testimonial.countDocuments({})).toBe(0);
  });
});

describe("updateTestimonialAction", () => {
  function updateForm(id, overrides) {
    return testimonialForm(Object.assign({ testimonialId: String(id), authorName: "Renamed Person" }, overrides || {}));
  }

  it("edits a draft", async () => {
    const t = await makeTestimonial();
    await asContentManager();
    const out = await run(() => updateTestimonialAction(null, updateForm(t._id)));
    expect(out.result.success).toBeTruthy();
    expect((await Testimonial.findById(t._id).lean()).authorName).toBe("Renamed Person");
    expect(await AuditLog.countDocuments({ action: "testimonial.update" })).toBe(1);
  });

  it("does not edit a published or archived testimonial", async () => {
    const live = await makeTestimonial({ status: "PUBLISHED" });
    const old = await makeTestimonial({ status: "ARCHIVED" });
    await asContentManager();
    for (const t of [live, old]) {
      const out = await run(() => updateTestimonialAction(null, updateForm(t._id)));
      expect(out.result.error).toMatch(/only a draft/i);
      expect((await Testimonial.findById(t._id).lean()).authorName).toBe("Existing Person");
    }
  });

  it("needs the consent tick again, and refuses a bad id and a role without permission", async () => {
    const t = await makeTestimonial();
    await asContentManager();
    const a = await run(() => updateTestimonialAction(null, updateForm(t._id, { consent: undefined })));
    expect(a.result.error).toMatch(/agreed to be quoted/i);
    const b = await run(() => updateTestimonialAction(null, updateForm("nope")));
    expect(b.result.error).toMatch(/invalid/i);
    const other = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(other);
    const c = await run(() => updateTestimonialAction(null, updateForm(t._id)));
    expect(c.result.error).toMatch(/permission/i);
  });
});

describe("setTestimonialStatusAction", () => {
  function statusForm(id, target) {
    return form({ testimonialId: String(id), target: target });
  }

  it("publishes a draft with consent and records who published it", async () => {
    const t = await makeTestimonial();
    const admin = await asContentManager();
    const out = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Testimonial.findById(t._id).lean();
    expect(saved.status).toBe("PUBLISHED");
    expect(String(saved.publishedBy)).toBe(String(admin._id));
    expect(await AuditLog.countDocuments({ action: "testimonial.status.published" })).toBe(1);
    const again = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("never publishes a testimonial without recorded consent", async () => {
    const t = await makeTestimonial({ consentConfirmed: false });
    await asContentManager();
    const out = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED")));
    expect(out.result.error).toMatch(/consent is not recorded/i);
    expect((await Testimonial.findById(t._id).lean()).status).toBe("DRAFT");
  });

  it("lets only one request win when two publish requests arrive at the same time", async () => {
    const t = await makeTestimonial();
    await asContentManager();
    const results = await Promise.all([
      run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED"))),
      run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "testimonial.status.published" })).toBe(1);
  });

  it("moves a published testimonial back to draft and archives it", async () => {
    const t = await makeTestimonial({ status: "PUBLISHED" });
    await asContentManager();
    const back = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "DRAFT")));
    expect(back.result.success).toBeTruthy();
    const archive = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "ARCHIVED")));
    expect(archive.result.success).toBeTruthy();
    expect((await Testimonial.findById(t._id).lean()).status).toBe("ARCHIVED");
  });

  it("refuses a resident, an operations manager and a visitor", async () => {
    const t = await makeTestimonial();
    for (const role of ["RESIDENT", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setTestimonialStatusAction(null, statusForm(t._id, "PUBLISHED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Testimonial.findById(t._id).lean()).status).toBe("DRAFT");
  });
});

describe("listPublicTestimonials", () => {
  it("lists only published testimonials with consent, in the given order", async () => {
    await makeTestimonial({ authorName: "Second", status: "PUBLISHED", sortOrder: 20, publishedAt: new Date() });
    await makeTestimonial({ authorName: "First", status: "PUBLISHED", sortOrder: 5, publishedAt: new Date() });
    await makeTestimonial({ authorName: "No consent", status: "PUBLISHED", consentConfirmed: false, publishedAt: new Date() });
    await makeTestimonial({ authorName: "Draft", status: "DRAFT" });
    await makeTestimonial({ authorName: "Archived", status: "ARCHIVED" });
    await makeTestimonial({ authorName: "Deleted", status: "PUBLISHED", deletedAt: new Date(), publishedAt: new Date() });

    const list = await listPublicTestimonials();
    expect(list.map((t) => t.authorName)).toEqual(["First", "Second"]);
  });

  it("returns only the public fields and never the consent note", async () => {
    await makeTestimonial({ status: "PUBLISHED", consentNote: "Secret staff note", publishedAt: new Date() });
    const list = await listPublicTestimonials();
    expect(Object.keys(list[0]).sort()).toEqual(["authorDetail", "authorName", "id", "quote"]);
    expect(JSON.stringify(list).includes("Secret staff note")).toBe(false);
  });

  it("shows at most twelve", async () => {
    for (let i = 1; i <= 14; i++) {
      await makeTestimonial({ authorName: "Person " + i, status: "PUBLISHED", sortOrder: i, publishedAt: new Date() });
    }
    expect(await listPublicTestimonials()).toHaveLength(12);
  });

  it("returns an empty list when nothing is published", async () => {
    expect(await listPublicTestimonials()).toEqual([]);
  });
});
