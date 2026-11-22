const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/reportStatus.js",
  "models/User.js",
  "models/AuditLog.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/articleRules.js", `
export const ARTICLE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ARTICLE_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const ARTICLE_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const ARTICLE_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const ARTICLE_CATEGORIES = {
  GENERAL: "General guidance",
  SEGREGATION: "Waste segregation",
  RECYCLING: "Recycling basics",
  COMPOSTING: "Composting",
  COMMUNITY: "Community action",
  SAFETY: "Safe handling",
};

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 200;
export const BODY_MIN = 50;
export const BODY_MAX = 8000;
export const SLUG_MAX = 60;

export function articleTargets(status) {
  return ARTICLE_STATUSES.filter((t) => ARTICLE_STATUS_FROM[t].includes(status));
}

export function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// The body keeps its line breaks.
export function normalizeBody(value) {
  return String(value == null ? "" : value).replace(/\\r\\n/g, "\\n").trim();
}

// No angle brackets and no control characters.
export function hasUnsafeCharacters(value) {
  return /[<>\\u0000-\\u001f\\u007f]/.test(String(value == null ? "" : value));
}

// Same, but line breaks and tabs are allowed in the body.
export function hasUnsafeBodyCharacters(value) {
  return /[<>\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/.test(String(value == null ? "" : value));
}

// Web address made from the title. It can be empty when the title has no a-z or 0-9 at all.
export function makeSlug(title) {
  return String(title == null ? "" : title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function isValidSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= SLUG_MAX;
}

// Returns an error message, or null when everything is fine.
export function validateArticleFields(fields) {
  const f = fields || {};
  const title = normalizeText(f.title);
  const summary = normalizeText(f.summary);
  const body = normalizeBody(f.body);
  if (title.length < TITLE_MIN) return "Title must be at least " + TITLE_MIN + " characters.";
  if (title.length > TITLE_MAX) return "Title is too long (" + TITLE_MAX + " characters maximum).";
  if (hasUnsafeCharacters(title)) return "The title must not contain < or > characters.";
  if (summary.length < SUMMARY_MIN) return "Summary must be at least " + SUMMARY_MIN + " characters.";
  if (summary.length > SUMMARY_MAX) return "Summary is too long (" + SUMMARY_MAX + " characters maximum).";
  if (hasUnsafeCharacters(summary)) return "The summary must not contain < or > characters.";
  if (body.length < BODY_MIN) return "The article text must be at least " + BODY_MIN + " characters.";
  if (body.length > BODY_MAX) return "The article text is too long (" + BODY_MAX + " characters maximum).";
  if (hasUnsafeBodyCharacters(body)) return "The article text must not contain < or > characters.";
  if (!Object.prototype.hasOwnProperty.call(ARTICLE_CATEGORIES, f.category)) return "Please choose a category.";
  return null;
}
`);

write("models/Article.js", `
import mongoose from "mongoose";
import { ARTICLE_STATUSES, ARTICLE_CATEGORIES } from "@/lib/articleRules";

const articleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 8000 },
    category: { type: String, enum: Object.keys(ARTICLE_CATEGORIES), required: true, index: true },
    status: { type: String, enum: ARTICLE_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Article || mongoose.model("Article", articleSchema);
`);

write("services/articles.js", `
import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import { isValidSlug } from "@/lib/articleRules";

// For public pages. Only published articles are read, and only the public fields are selected.
export async function listPublicArticles() {
  await connectDB();
  const list = await Article.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ publishedAt: -1 })
    .limit(100)
    .select("title slug summary category publishedAt")
    .lean();
  return list.map((a) => ({
    id: a._id.toString(),
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    category: a.category,
    publishedAt: a.publishedAt || null,
  }));
}

// Returns null when the article does not exist, is not published, or the address is malformed.
export async function getPublicArticle(slug) {
  if (!isValidSlug(slug)) return null;
  await connectDB();
  const a = await Article.findOne({ slug: slug, status: "PUBLISHED", deletedAt: null })
    .select("title slug summary body category publishedAt")
    .lean();
  if (!a) return null;
  return {
    id: a._id.toString(),
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    body: a.body,
    category: a.category,
    publishedAt: a.publishedAt || null,
  };
}
`);

write("actions/articles.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_FROM,
  normalizeText,
  normalizeBody,
  makeSlug,
  validateArticleFields,
} from "@/lib/articleRules";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid article");

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    summary: String(formData.get("summary") || ""),
    body: String(formData.get("body") || ""),
    category: String(formData.get("category") || ""),
  };
}

function refresh(slug) {
  revalidatePath("/admin/content");
  revalidatePath("/learn");
  if (slug) revalidatePath("/learn/" + slug);
}

export async function createArticleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const d = readFields(formData);
  const problem = validateArticleFields(d);
  if (problem) return { error: problem };
  const slug = makeSlug(normalizeText(d.title));
  if (!slug) return { error: "The title needs letters (a to z) or numbers to make a web address." };

  try {
    await connectDB();
    const created = await Article.create({
      title: normalizeText(d.title),
      slug: slug,
      summary: normalizeText(d.summary),
      body: normalizeBody(d.body),
      category: d.category,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "article.create",
      targetType: "Article",
      targetId: created._id.toString(),
      metadata: { slug: slug },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "An article with this web address already exists. Change the title." };
    console.error("Create article failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Article saved as a draft. It is not public until you publish it." };
}

export async function updateArticleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const idCheck = objectId.safeParse(String(formData.get("articleId") || ""));
  if (!idCheck.success) return { error: idCheck.error.issues[0].message };
  const d = readFields(formData);
  const problem = validateArticleFields(d);
  if (problem) return { error: problem };

  try {
    await connectDB();
    // Only a draft can be edited, and the web address never changes, so links keep working.
    const updated = await Article.findOneAndUpdate(
      { _id: idCheck.data, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          title: normalizeText(d.title),
          summary: normalizeText(d.summary),
          body: normalizeBody(d.body),
          category: d.category,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft article can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "article.update",
      targetType: "Article",
      targetId: idCheck.data,
    });
  } catch (err) {
    console.error("Update article failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Article updated." };
}

const statusSchema = z.object({
  articleId: objectId,
  target: z.enum(ARTICLE_STATUSES, { message: "Invalid status" }),
});

export async function setArticleStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    articleId: String(formData.get("articleId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { articleId: id, target } = parsed.data;

  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  let slug = "";
  try {
    await connectDB();
    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Article.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: ARTICLE_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("slug");
    if (!updated) return { error: "This article cannot be moved to that status. Please reload." };
    slug = updated.slug;

    await writeAudit({
      actor: user.id,
      action: "article.status." + target.toLowerCase(),
      targetType: "Article",
      targetId: id,
    });
  } catch (err) {
    console.error("Set article status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(slug);
  return { success: "Article status updated." };
}
`);

write("components/forms/ArticleForms.js", `
"use client";

import { useActionState } from "react";
import { createArticleAction, updateArticleAction, setArticleStatusAction } from "@/actions/articles";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const smallButton = "min-h-11 rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";

function Feedback({ state }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
    </>
  );
}

// categories: [{ value, label }]   article: { id, title, summary, body, category }
function Fields({ idPrefix, categories, article }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title (5 to 120 characters)</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={5} maxLength={120}
          defaultValue={article ? article.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-category"} className="mb-1 block text-sm font-medium">Category</label>
        <select id={idPrefix + "-category"} name="category" required defaultValue={article ? article.category : ""} className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={idPrefix + "-summary"} className="mb-1 block text-sm font-medium">Short summary (10 to 200 characters)</label>
        <textarea id={idPrefix + "-summary"} name="summary" rows={2} required minLength={10} maxLength={200}
          defaultValue={article ? article.summary : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-body"} className="mb-1 block text-sm font-medium">
          Article text (50 to 8000 characters, plain text; blank lines make new paragraphs)
        </label>
        <textarea id={idPrefix + "-body"} name="body" rows={10} required minLength={50} maxLength={8000}
          defaultValue={article ? article.body : ""} className={field} />
      </div>
    </>
  );
}

export default function ArticleForm({ categories }) {
  const [state, formAction, pending] = useActionState(createArticleAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-article" categories={categories} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save article (draft)"}
      </button>
    </form>
  );
}

export function EditArticleForm({ article, categories }) {
  const [state, formAction, pending] = useActionState(updateArticleAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="articleId" value={article.id} />
      <Fields idPrefix={"edit-article-" + article.id} categories={categories} article={article} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function ArticleStatusButton({ articleId, target, label }) {
  const [state, formAction, pending] = useActionState(setArticleStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("app/admin/(panel)/content/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_LABELS,
  ARTICLE_TARGET_LABELS,
  ARTICLE_CATEGORIES,
  articleTargets,
} from "@/lib/articleRules";
import ArticleForm, { EditArticleForm, ArticleStatusButton } from "@/components/forms/ArticleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Content Library | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/content" + (status ? "?status=" + status : "");
}

export default async function AdminContentPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = ARTICLE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Article.find(filter).sort({ createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load articles failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(ARTICLE_CATEGORIES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    ARTICLE_STATUSES.map((s) => ({ label: ARTICLE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Content Library</h1>
        <p className="mt-1 text-sm text-gray-600">
          Educational articles for the public Learn page. Only published articles are public. An article can be edited only
          while it is a draft, and its web address never changes. Text is plain text. Images are not part of this version.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Articles could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No articles match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((a) => {
              const id = a._id.toString();
              const plain = { id: id, title: a.title, summary: a.summary, body: a.body, category: a.category };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <StatusBadge status={a.status} label={ARTICLE_STATUS_LABELS[a.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{a.summary}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    {ARTICLE_CATEGORIES[a.category] || a.category} | Address: /learn/{a.slug}
                    {a.publishedAt ? " | Published " + formatDateTime(a.publishedAt) : ""}
                    {a.publishedBy ? " by " + a.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {articleTargets(a.status).map((t) => (
                      <ArticleStatusButton key={t} articleId={id} target={t} label={ARTICLE_TARGET_LABELS[t]} />
                    ))}
                    {a.status === "PUBLISHED" && (
                      <Link href={"/learn/" + a.slug} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">
                        View public page
                      </Link>
                    )}
                  </div>
                  {a.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditArticleForm article={plain} categories={categories} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Write an article</h2>
        <ArticleForm categories={categories} />
      </section>
    </div>
  );
}
`);

write("app/(public)/learn/page.js", `
import Link from "next/link";
import { listPublicArticles } from "@/services/articles";
import { ARTICLE_CATEGORIES } from "@/lib/articleRules";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Learn | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let items = [];
  let loadError = false;
  try {
    items = await listPublicArticles();
  } catch (err) {
    console.error("Load public articles failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Learn</h1>
      <p className="mt-2 text-sm text-gray-700">
        General guidance on waste and community cleanliness. Local rules may differ, so follow instructions from your
        local authority where they exist.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Articles are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState>No articles have been published yet.</EmptyState>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-6 space-y-4">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{ARTICLE_CATEGORIES[a.category] || a.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/learn/" + a.slug} className="text-emerald-900 underline">{a.title}</Link>
              </h2>
              <p className="mt-1 text-sm text-gray-700">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`);

write("app/(public)/learn/[slug]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArticle } from "@/services/articles";
import { ARTICLE_CATEGORIES } from "@/lib/articleRules";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Learn | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }) {
  const { slug } = await params;

  let article = null;
  let loadError = false;
  try {
    article = await getPublicArticle(slug);
  } catch (err) {
    console.error("Load public article failed:", err.message);
    loadError = true;
  }

  if (!loadError && !article) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/learn" className="text-sm font-semibold text-emerald-800 underline">All articles</Link>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>This article is temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}

      {article && (
        <article className="mt-4">
          <p className="text-xs font-semibold text-emerald-800">{ARTICLE_CATEGORIES[article.category] || article.category}</p>
          <h1 className="mt-1 text-3xl font-bold text-emerald-900">{article.title}</h1>
          {article.publishedAt && (
            <p className="mt-1 text-xs text-gray-600">
              Published: {new Date(article.publishedAt).toISOString().slice(0, 10)}
            </p>
          )}
          <p className="mt-4 text-base text-gray-800">{article.summary}</p>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-6 text-gray-800">{article.body}</div>
          <p className="mt-8 text-xs text-gray-600">
            This is general guidance. Local rules may differ.
          </p>
        </article>
      )}
    </main>
  );
}
`);

write("tests/unit/articleRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_FROM,
  articleTargets,
  normalizeText,
  normalizeBody,
  hasUnsafeCharacters,
  hasUnsafeBodyCharacters,
  makeSlug,
  isValidSlug,
  validateArticleFields,
} from "@/lib/articleRules";

const good = {
  title: "How to sort household waste",
  summary: "A short guide to sorting waste at home.",
  body: "x".repeat(60),
  category: "SEGREGATION",
};

describe("article status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    ARTICLE_STATUSES.forEach((s) => expect(ARTICLE_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(ARTICLE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ARTICLE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ARTICLE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(articleTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(articleTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(articleTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(articleTargets("MADE_UP")).toEqual([]);
  });
});

describe("text helpers", () => {
  it("normalises spacing and keeps line breaks in the body", () => {
    expect(normalizeText("  a   b \\n c ")).toBe("a b c");
    expect(normalizeBody("line one\\r\\nline two  ")).toBe("line one\\nline two");
  });

  it("spots unsafe characters, but allows line breaks in the body", () => {
    expect(hasUnsafeCharacters("<b>x</b>")).toBe(true);
    expect(hasUnsafeCharacters("a\\nb")).toBe(true);
    expect(hasUnsafeBodyCharacters("a\\nb\\tc")).toBe(false);
    expect(hasUnsafeBodyCharacters("a <script> b")).toBe(true);
    expect(hasUnsafeBodyCharacters("bad\\u0007text")).toBe(true);
  });
});

describe("slugs", () => {
  it("makes a short lowercase address from the title", () => {
    expect(makeSlug("Sorting Glass & Metal!")).toBe("sorting-glass-metal");
    expect(makeSlug("  Tips 101  ")).toBe("tips-101");
    expect(makeSlug("a".repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it("gives an empty address when there is no a-z or 0-9", () => {
    expect(makeSlug("!!!")).toBe("");
    expect(makeSlug("عائشہ")).toBe("");
  });

  it("accepts only well-formed addresses", () => {
    ["sorting-glass", "tips-101", "a"].forEach((s) => expect(isValidSlug(s)).toBe(true));
    ["", "-bad", "bad-", "Bad", "a b", "a/b", "a--b", "../x", null, undefined, 5].forEach((s) => {
      expect(isValidSlug(s)).toBe(false);
    });
  });
});

describe("validateArticleFields", () => {
  it("accepts good fields", () => {
    expect(validateArticleFields(good)).toBeNull();
  });

  it("rejects a short or long title, summary and text", () => {
    expect(validateArticleFields(Object.assign({}, good, { title: "abc" }))).toMatch(/title/i);
    expect(validateArticleFields(Object.assign({}, good, { title: "x".repeat(121) }))).toMatch(/title/i);
    expect(validateArticleFields(Object.assign({}, good, { summary: "short" }))).toMatch(/summary/i);
    expect(validateArticleFields(Object.assign({}, good, { body: "short" }))).toMatch(/article text/i);
    expect(validateArticleFields(Object.assign({}, good, { body: "x".repeat(8001) }))).toMatch(/too long/i);
  });

  it("rejects angle brackets and an unknown category", () => {
    expect(validateArticleFields(Object.assign({}, good, { title: "A <b>bold</b> title" }))).toMatch(/< or >/);
    expect(validateArticleFields(Object.assign({}, good, { body: "x".repeat(60) + " <script>" }))).toMatch(/< or >/);
    expect(validateArticleFields(Object.assign({}, good, { category: "HACKED" }))).toMatch(/category/i);
    expect(validateArticleFields(Object.assign({}, good, { category: undefined }))).toMatch(/category/i);
  });
});
`);

write("tests/integration/articles.test.js", `
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
`);

// ---- Check 3: read every file back (comments are ignored, so a word in a comment cannot trigger a false alarm) ----
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(code)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if ((code.match(/requireActionPermission\("content\.publish"\)/g) || []).length < 3) {
      problems.push("every action must check content.publish");
    }
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/content/page.js" && !code.includes('requirePermission("content.publish")')) {
    problems.push("missing page permission check");
  }
  if (f === "services/articles.js") {
    if (!code.includes('status: "PUBLISHED"')) problems.push("public reads must only use published articles");
    if (/createdBy|publishedBy/.test(code)) problems.push("public reads must not select internal fields");
  }
  if (f === "models/Article.js" && !code.includes("unique: true")) problems.push("slug must be unique");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: node scripts/verify-all.js");