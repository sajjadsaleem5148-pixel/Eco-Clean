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
import { createArticleAction, updateArticleAction, setArticleStatusAction } from "@/actions/articles";
import { listPublicArticles, getPublicArticle } from "@/services/articles";
import Article from "@/models/Article";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function articleForm(overrides) {
  return form(
    Object.assign(
      {
        title: "How to sort household waste",
        summary: "A short guide to sorting waste at home.",
        body: "First separate dry items from wet items. Then keep each bag clean. ".repeat(2),
        category: "SEGREGATION",
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

function makeArticle(overrides) {
  return Article.create(
    Object.assign(
      {
        title: "Existing article",
        slug: "existing-article-" + Math.random().toString(36).slice(2, 8),
        summary: "An article that already exists.",
        body: "x".repeat(60),
        category: "GENERAL",
        status: "DRAFT",
      },
      overrides || {}
    )
  );
}

describe("createArticleAction", () => {
  it("saves a draft with a web address made from the title and an audit entry", async () => {
    const admin = await asContentManager();
    const out = await run(() => createArticleAction(null, articleForm()));
    expect(out.result.success).toBeTruthy();
    const saved = await Article.findOne({}).lean();
    expect(saved.status).toBe("DRAFT");
    expect(saved.slug).toBe("how-to-sort-household-waste");
    expect(String(saved.createdBy)).toBe(String(admin._id));
    expect(await AuditLog.countDocuments({ action: "article.create" })).toBe(1);
  });

  it("refuses a second article that would get the same web address", async () => {
    await asContentManager();
    await run(() => createArticleAction(null, articleForm()));
    const again = await run(() => createArticleAction(null, articleForm({ title: "How to sort household waste!" })));
    expect(again.result.error).toMatch(/already exists/i);
    expect(await Article.countDocuments({})).toBe(1);
  });

  it("creates only one article when the same title arrives twice at the same time", async () => {
    await asContentManager();
    const results = await Promise.all([
      run(() => createArticleAction(null, articleForm())),
      run(() => createArticleAction(null, articleForm())),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Article.countDocuments({})).toBe(1);
  });

  it("refuses a title without letters or numbers, short text, brackets and an unknown category", async () => {
    await asContentManager();
    const a = await run(() => createArticleAction(null, articleForm({ title: "!!!!!" })));
    expect(a.result.error).toMatch(/web address/i);
    const b = await run(() => createArticleAction(null, articleForm({ body: "too short" })));
    expect(b.result.error).toMatch(/article text/i);
    const c = await run(() => createArticleAction(null, articleForm({ title: "A <b>bold</b> title" })));
    expect(c.result.error).toMatch(/< or >/);
    const d = await run(() => createArticleAction(null, articleForm({ category: "HACKED" })));
    expect(d.result.error).toMatch(/category/i);
    expect(await Article.countDocuments({})).toBe(0);
  });

  it("refuses every role without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createArticleAction(null, articleForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createArticleAction(null, articleForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Article.countDocuments({})).toBe(0);
  });
});

describe("updateArticleAction", () => {
  function updateForm(id, overrides) {
    return articleForm(Object.assign({ articleId: String(id), title: "A completely new title" }, overrides || {}));
  }

  it("edits a draft but never changes its web address", async () => {
    const a = await makeArticle({ slug: "stable-address" });
    await asContentManager();
    const out = await run(() => updateArticleAction(null, updateForm(a._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Article.findById(a._id).lean();
    expect(saved.title).toBe("A completely new title");
    expect(saved.slug).toBe("stable-address");
    expect(await AuditLog.countDocuments({ action: "article.update" })).toBe(1);
  });

  it("does not edit a published or archived article", async () => {
    const live = await makeArticle({ status: "PUBLISHED" });
    const old = await makeArticle({ status: "ARCHIVED" });
    await asContentManager();
    for (const a of [live, old]) {
      const out = await run(() => updateArticleAction(null, updateForm(a._id)));
      expect(out.result.error).toMatch(/only a draft/i);
      expect((await Article.findById(a._id).lean()).title).toBe("Existing article");
    }
  });

  it("refuses a bad id and a role without permission", async () => {
    const a = await makeArticle();
    await asContentManager();
    const bad = await run(() => updateArticleAction(null, updateForm("nope")));
    expect(bad.result.error).toMatch(/invalid/i);
    const other = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(other);
    const denied = await run(() => updateArticleAction(null, updateForm(a._id)));
    expect(denied.result.error).toMatch(/permission/i);
  });
});

describe("setArticleStatusAction", () => {
  function statusForm(id, target) {
    return form({ articleId: String(id), target: target });
  }

  it("publishes a draft and records who published it", async () => {
    const a = await makeArticle();
    const admin = await asContentManager();
    const out = await run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Article.findById(a._id).lean();
    expect(saved.status).toBe("PUBLISHED");
    expect(String(saved.publishedBy)).toBe(String(admin._id));
    expect(saved.publishedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "article.status.published" })).toBe(1);
    const again = await run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("lets only one request win when two publish requests arrive at the same time", async () => {
    const a = await makeArticle();
    await asContentManager();
    const results = await Promise.all([
      run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED"))),
      run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "article.status.published" })).toBe(1);
  });

  it("moves a published article back to draft and archives it", async () => {
    const a = await makeArticle({ status: "PUBLISHED" });
    await asContentManager();
    const back = await run(() => setArticleStatusAction(null, statusForm(a._id, "DRAFT")));
    expect(back.result.success).toBeTruthy();
    const archive = await run(() => setArticleStatusAction(null, statusForm(a._id, "ARCHIVED")));
    expect(archive.result.success).toBeTruthy();
    expect((await Article.findById(a._id).lean()).status).toBe("ARCHIVED");
  });

  it("refuses a resident, an operations manager and a visitor", async () => {
    const a = await makeArticle();
    for (const role of ["RESIDENT", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setArticleStatusAction(null, statusForm(a._id, "PUBLISHED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Article.findById(a._id).lean()).status).toBe("DRAFT");
  });
});

describe("public reading", () => {
  it("lists only published articles, newest first, with public fields only", async () => {
    await makeArticle({ title: "Older", slug: "older", status: "PUBLISHED", publishedAt: new Date(Date.now() - 5000) });
    await makeArticle({ title: "Newer", slug: "newer", status: "PUBLISHED", publishedAt: new Date() });
    await makeArticle({ title: "Draft", slug: "draft-one", status: "DRAFT" });
    await makeArticle({ title: "Archived", slug: "archived-one", status: "ARCHIVED" });
    await makeArticle({ title: "Deleted", slug: "deleted-one", status: "PUBLISHED", deletedAt: new Date(), publishedAt: new Date() });

    const list = await listPublicArticles();
    expect(list.map((a) => a.title)).toEqual(["Newer", "Older"]);
    expect(Object.keys(list[0]).sort()).toEqual(["category", "id", "publishedAt", "slug", "summary", "title"]);
  });

  it("returns a published article by address and nothing for the rest", async () => {
    await makeArticle({ title: "Live", slug: "live-one", status: "PUBLISHED", publishedAt: new Date() });
    await makeArticle({ title: "Hidden", slug: "hidden-one", status: "DRAFT" });
    expect((await getPublicArticle("live-one")).title).toBe("Live");
    expect(await getPublicArticle("hidden-one")).toBeNull();
    expect(await getPublicArticle("does-not-exist")).toBeNull();
    expect(await getPublicArticle("../etc")).toBeNull();
    expect(await getPublicArticle(undefined)).toBeNull();
  });

  it("returns an empty list when nothing is published", async () => {
    expect(await listPublicArticles()).toEqual([]);
  });
});
