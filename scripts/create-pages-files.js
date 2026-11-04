const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/pageKeys.js", `
export const PAGE_KEYS = {
  ABOUT: { label: "About ECO-CLEAN", path: "/about" },
  PRIVACY: { label: "Privacy Policy", path: "/privacy" },
  TERMS: { label: "Terms of Service", path: "/terms" },
};

export const PAGE_KEY_LIST = Object.keys(PAGE_KEYS);

export const PAGE_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const PAGE_OPS = ["publish", "unpublish", "archive"];

export const PAGE_OP_FROM = {
  publish: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  unpublish: ["PUBLISHED"],
  archive: ["DRAFT", "PUBLISHED"],
};

export const PAGE_OP_TARGET = {
  publish: "PUBLISHED",
  unpublish: "DRAFT",
  archive: "ARCHIVED",
};

export const ANN_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ANN_STATUS_LABELS = PAGE_STATUS_LABELS;

export const ANN_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const ANN_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function annTargets(status) {
  return ANN_STATUSES.filter((t) => ANN_STATUS_FROM[t].includes(status));
}
`);

write("models/WebsitePage.js", `
import mongoose from "mongoose";
import { PAGE_KEY_LIST } from "@/lib/pageKeys";

const pageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PAGE_KEY_LIST, required: true, unique: true },
    title: { type: String, trim: true, maxlength: 150 },
    body: { type: String, maxlength: 20000 },
    draftTitle: { type: String, trim: true, maxlength: 150 },
    draftBody: { type: String, maxlength: 20000 },
    status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.WebsitePage || mongoose.model("WebsitePage", pageSchema);
`);

write("models/Announcement.js", `
import mongoose from "mongoose";
import { ANN_STATUSES } from "@/lib/pageKeys";

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ANN_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
`);

write("actions/pages.js", `
"use server";

import { z } from "zod";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import Announcement from "@/models/Announcement";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  PAGE_KEY_LIST,
  PAGE_KEYS,
  PAGE_OPS,
  PAGE_OP_FROM,
  PAGE_OP_TARGET,
  ANN_STATUSES,
  ANN_STATUS_FROM,
} from "@/lib/pageKeys";

function refreshPages(key) {
  revalidatePath("/admin/pages");
  if (key) revalidatePath(PAGE_KEYS[key].path);
}

function refreshAnnouncements() {
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

const draftSchema = z.object({
  key: z.enum(PAGE_KEY_LIST, { message: "Invalid page" }),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
  body: z.string().trim().min(20, "Text must be at least 20 characters").max(20000, "Text is too long"),
});

export async function savePageDraftAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = draftSchema.safeParse({
    key: formData.get("key"),
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, title, body } = parsed.data;

  try {
    await connectDB();
    await WebsitePage.findOneAndUpdate(
      { key },
      {
        $set: { draftTitle: title, draftBody: body, updatedBy: user.id },
        $setOnInsert: { key, status: "DRAFT" },
      },
      { upsert: true, returnDocument: "after" }
    );
    await writeAudit({
      actor: user.id,
      action: "page.draft.save",
      targetType: "WebsitePage",
      targetId: key,
    });
  } catch (err) {
    console.error("Save page draft failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshPages(null);
  return { success: "Draft saved. It is not public until you publish it." };
}

const opSchema = z.object({
  key: z.enum(PAGE_KEY_LIST, { message: "Invalid page" }),
  op: z.enum(PAGE_OPS, { message: "Invalid action" }),
});

export async function pageStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = opSchema.safeParse({
    key: formData.get("key"),
    op: formData.get("op"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, op } = parsed.data;

  try {
    await connectDB();
    let updated = null;

    if (op === "publish") {
      const page = await WebsitePage.findOne({ key }).select("status draftTitle draftBody").lean();
      if (!page || !page.draftBody || !page.draftTitle) {
        return { error: "Save a draft first. There is nothing to publish yet." };
      }
      updated = await WebsitePage.findOneAndUpdate(
        {
          key,
          status: { $in: PAGE_OP_FROM.publish },
          draftTitle: page.draftTitle,
          draftBody: page.draftBody,
        },
        {
          $set: {
            title: page.draftTitle,
            body: page.draftBody,
            status: "PUBLISHED",
            publishedBy: new mongoose.Types.ObjectId(user.id),
            publishedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      ).select("_id");
    } else {
      updated = await WebsitePage.findOneAndUpdate(
        { key, status: { $in: PAGE_OP_FROM[op] } },
        { $set: { status: PAGE_OP_TARGET[op] } },
        { returnDocument: "after" }
      ).select("_id");
    }

    if (!updated) return { error: "This action is not available for the page right now. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "page." + op,
      targetType: "WebsitePage",
      targetId: key,
    });
  } catch (err) {
    console.error("Page status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshPages(key);
  return { success: "Done." };
}

const annSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  body: z.string().trim().min(5, "Message must be at least 5 characters").max(300),
});

export async function createAnnouncementAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = annSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const created = await Announcement.create({ ...parsed.data, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "announcement.create",
      targetType: "Announcement",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create announcement failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAnnouncements();
  return { success: "Announcement created as a draft. Publish it when it is ready." };
}

const annStatusSchema = z.object({
  id: z.string().regex(/^[a-f\\d]{24}$/i, "Invalid announcement"),
  target: z.enum(ANN_STATUSES, { message: "Invalid status" }),
});

export async function setAnnouncementStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = annStatusSchema.safeParse({
    id: formData.get("id"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, target } = parsed.data;

  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  try {
    await connectDB();
    const updated = await Announcement.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: ANN_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This announcement cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: "announcement." + target.toLowerCase(),
      targetType: "Announcement",
      targetId: id,
    });
  } catch (err) {
    console.error("Set announcement status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAnnouncements();
  return { success: "Updated." };
}
`);

write("components/forms/PageForms.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  savePageDraftAction,
  pageStatusAction,
  createAnnouncementAction,
  setAnnouncementStatusAction,
} from "@/actions/pages";

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

export function PageDraftForm({ pageKey, title, body }) {
  const [state, formAction, pending] = useActionState(savePageDraftAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="key" value={pageKey} />
      <div>
        <label htmlFor={"pt-" + pageKey} className="mb-1 block text-sm font-medium">Page title</label>
        <input id={"pt-" + pageKey} name="title" type="text" required minLength={3} maxLength={150}
          defaultValue={title} className={field} />
      </div>
      <div>
        <label htmlFor={"pb-" + pageKey} className="mb-1 block text-sm font-medium">
          Text (plain text; blank lines make new paragraphs)
        </label>
        <textarea id={"pb-" + pageKey} name="body" rows={10} required minLength={20} maxLength={20000}
          defaultValue={body} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save draft"}
      </button>
    </form>
  );
}

export function PageStatusButton({ pageKey, op, label }) {
  const [state, formAction, pending] = useActionState(pageStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="key" value={pageKey} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}

export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState(createAnnouncementAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="an-title" className="mb-1 block text-sm font-medium">Title</label>
        <input id="an-title" name="title" type="text" required minLength={3} maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="an-body" className="mb-1 block text-sm font-medium">Message (up to 300 characters)</label>
        <textarea id="an-body" name="body" rows={3} required minLength={5} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create announcement (draft)"}
      </button>
    </form>
  );
}

export function AnnouncementStatusButton({ id, target, label }) {
  const [state, formAction, pending] = useActionState(setAnnouncementStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("components/ui/CmsPage.js", `
import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import { PAGE_KEYS } from "@/lib/pageKeys";

export default async function CmsPage({ pageKey }) {
  const meta = PAGE_KEYS[pageKey];
  let page = null;
  let loadError = false;

  try {
    await connectDB();
    page = await WebsitePage.findOne({ key: pageKey, status: "PUBLISHED" })
      .select("title body publishedAt")
      .lean();
  } catch (err) {
    console.error("Load CMS page failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {loadError && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{meta.label}</h1>
          <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            This page is temporarily unavailable. Please try again later.
          </p>
        </>
      )}

      {!loadError && !page && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{meta.label}</h1>
          <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            This page has not been published yet.
          </p>
        </>
      )}

      {!loadError && page && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{page.title}</h1>
          {page.publishedAt && (
            <p className="mt-1 text-xs text-gray-600">
              Last updated: {new Date(page.publishedAt).toISOString().slice(0, 10)}
            </p>
          )}
          <div className="mt-6 whitespace-pre-wrap text-sm leading-6 text-gray-800">{page.body}</div>
        </>
      )}
    </main>
  );
}
`);

write("app/(public)/layout.js", `
import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";
import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";

export const dynamic = "force-dynamic";

async function loadAnnouncements() {
  try {
    await connectDB();
    return await Announcement.find({ status: "PUBLISHED", deletedAt: null })
      .sort({ publishedAt: -1 })
      .limit(2)
      .select("title body")
      .lean();
  } catch (err) {
    console.error("Load announcements failed:", err.message);
    return [];
  }
}

export default async function PublicLayout({ children }) {
  const announcements = await loadAnnouncements();

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {announcements.length > 0 && (
        <section aria-label="Announcements" className="border-b border-emerald-200 bg-emerald-50">
          <ul className="mx-auto max-w-6xl space-y-1 px-4 py-2 text-sm text-emerald-950">
            {announcements.map((a) => (
              <li key={a._id.toString()}>
                <span className="font-semibold">{a.title}:</span> {a.body}
              </li>
            ))}
          </ul>
        </section>
      )}
      <PublicNavbar />
      {children}
      <Footer />
    </div>
  );
}
`);

write("app/(public)/about/page.js", `
import CmsPage from "@/components/ui/CmsPage";

export const metadata = { title: "About | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default function AboutPage() {
  return <CmsPage pageKey="ABOUT" />;
}
`);

write("app/(public)/privacy/page.js", `
import CmsPage from "@/components/ui/CmsPage";

export const metadata = { title: "Privacy Policy | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <CmsPage pageKey="PRIVACY" />;
}
`);

write("app/(public)/terms/page.js", `
import CmsPage from "@/components/ui/CmsPage";

export const metadata = { title: "Terms of Service | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <CmsPage pageKey="TERMS" />;
}
`);

write("app/admin/(panel)/pages/page.js", `
import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { PAGE_KEYS, PAGE_KEY_LIST, PAGE_STATUS_LABELS } from "@/lib/pageKeys";
import { PageDraftForm, PageStatusButton } from "@/components/forms/PageForms";

export const metadata = { title: "Website Pages | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  await requirePermission("content.publish");

  const docs = {};
  let loadError = false;
  try {
    await connectDB();
    const list = await WebsitePage.find({}).populate("publishedBy", "name").lean();
    list.forEach((d) => {
      docs[d.key] = d;
    });
  } catch (err) {
    console.error("Load pages failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Website Pages</h1>
        <p className="mt-1 text-sm text-gray-600">
          Write a draft, check the preview, then publish. The public page changes only when you publish.
          Privacy and Terms are legal documents: have them reviewed before publishing.
        </p>
        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Pages could not be loaded. The database may be unavailable.
          </p>
        )}
      </section>

      {!loadError &&
        PAGE_KEY_LIST.map((key) => {
          const d = docs[key];
          const status = d ? d.status : null;
          const title = d ? d.draftTitle || d.title || "" : "";
          const body = d ? d.draftBody || d.body || "" : "";
          const hasDraft = Boolean(d && d.draftTitle && d.draftBody);

          return (
            <section key={key} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{PAGE_KEYS[key].label}</h2>
              <p className="mt-1 text-sm text-gray-700">
                Public address: {PAGE_KEYS[key].path} | Status:{" "}
                <span className="font-semibold">{status ? PAGE_STATUS_LABELS[status] : "Not created"}</span>
              </p>
              {d && d.publishedAt && (
                <p className="text-xs text-gray-600">
                  Published {formatDateTime(d.publishedAt)}
                  {d.publishedBy ? " by " + d.publishedBy.name : ""}
                </p>
              )}

              <div className="mt-4">
                <PageDraftForm pageKey={key} title={title} body={body} />
              </div>

              {hasDraft && (
                <details className="mt-4 rounded-md border border-gray-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Preview draft</summary>
                  <h3 className="mt-3 text-xl font-bold text-emerald-900">{d.draftTitle}</h3>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">{d.draftBody}</div>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {hasDraft && (
                  <PageStatusButton
                    pageKey={key}
                    op="publish"
                    label={status === "PUBLISHED" ? "Publish latest draft" : "Publish"}
                  />
                )}
                {status === "PUBLISHED" && <PageStatusButton pageKey={key} op="unpublish" label="Unpublish" />}
                {(status === "DRAFT" || status === "PUBLISHED") && (
                  <PageStatusButton pageKey={key} op="archive" label="Archive" />
                )}
              </div>
            </section>
          );
        })}
    </div>
  );
}
`);

write("app/admin/(panel)/announcements/page.js", `
import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ANN_STATUS_LABELS, ANN_TARGET_LABELS, annTargets } from "@/lib/pageKeys";
import { AnnouncementForm, AnnouncementStatusButton } from "@/components/forms/PageForms";

export const metadata = { title: "Announcements | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requirePermission("content.publish");

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Announcement.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load announcements failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="mt-1 text-sm text-gray-600">
          The two most recently published announcements appear as a banner at the top of every public page.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Announcements could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && items.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No announcements yet. Create the first one below.
          </p>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((a) => (
              <li key={a._id.toString()} className="rounded-md border border-gray-200 p-4">
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 text-sm text-gray-700">{a.body}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Status: {ANN_STATUS_LABELS[a.status] || a.status}
                  {a.publishedAt ? " | Published " + formatDateTime(a.publishedAt) : ""}
                  {a.publishedBy ? " by " + a.publishedBy.name : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {annTargets(a.status).map((t) => (
                    <AnnouncementStatusButton
                      key={t}
                      id={a._id.toString()}
                      target={t}
                      label={ANN_TARGET_LABELS[t]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create an announcement</h2>
        <AnnouncementForm />
      </section>
    </div>
  );
}
`);

console.log("\nSab pages files ban gayin.");
