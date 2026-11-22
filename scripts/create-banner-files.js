const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/permissions/roles.js",
  "lib/reportStatus.js",
  "lib/campaignRules.js",
  "models/User.js",
  "models/AuditLog.js",
  "models/Announcement.js",
  "components/layout/PublicNavbar.js",
  "components/layout/Footer.js",
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
  console.error("FAILED: These files were not found, run their scripts first (campaigns and pages scripts):");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const layoutFile = "app/(public)/layout.js";
if (!fs.existsSync(layoutFile) || !fs.readFileSync(layoutFile, "utf8").includes("loadAnnouncements")) {
  console.error("FAILED: " + layoutFile + " does not contain the announcements code (loadAnnouncements).");
  console.error("Run create-pages-files.js first, or send me the file. Nothing was written.");
  process.exit(1);
}

// Backup of the layout, which is replaced below. An older backup is never overwritten.
const backupDir = "scripts/backup-banners";
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, "public-layout.js.bak");
if (!fs.existsSync(backupFile)) {
  fs.copyFileSync(layoutFile, backupFile);
  console.log("Backup:", backupFile);
} else {
  console.log("Backup already exists, kept:", backupFile);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/bannerRules.js", `
export const BANNER_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const BANNER_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const BANNER_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const BANNER_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const MAX_PUBLIC_BANNERS = 3;
export const DEFAULT_LINK_LABEL = "Learn more";
export const MAX_LINK_LABEL = 30;

export function bannerTargets(status) {
  return BANNER_STATUSES.filter((t) => BANNER_STATUS_FROM[t].includes(status));
}

// Only a path inside this site or a full https address is allowed.
// Script links, http links, protocol-relative links, links with a password and bare hosts are dropped.
// Returns the safe link, or undefined.
export function safeBannerLink(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 200) return undefined;
  if (text.startsWith("//")) return undefined;
  if (text.startsWith("/")) {
    return /^[/][A-Za-z0-9/_.?=&#-]{0,198}$/.test(text) ? text : undefined;
  }
  let url;
  try {
    url = new URL(text);
  } catch (err) {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname.includes(".")) return undefined;
  return url.toString();
}

export function isInternalLink(link) {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//");
}
`);

write("models/Banner.js", `
import mongoose from "mongoose";
import { BANNER_STATUSES } from "@/lib/bannerRules";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    text: { type: String, required: true, trim: true, maxlength: 200 },
    linkUrl: { type: String, trim: true, maxlength: 200 },
    linkLabel: { type: String, trim: true, maxlength: 30 },
    startDate: { type: String },
    endDate: { type: String },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: BANNER_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Banner || mongoose.model("Banner", bannerSchema);
`);

write("services/banners.js", `
import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import { campaignPhase } from "@/lib/campaignRules";
import { MAX_PUBLIC_BANNERS, DEFAULT_LINK_LABEL, safeBannerLink, isInternalLink } from "@/lib/bannerRules";

// For public pages: published banners that are running now, at most MAX_PUBLIC_BANNERS.
// The link is checked again here, so an unsafe link stored directly in the database is never shown.
export async function listPublicBanners(now) {
  await connectDB();
  const list = await Banner.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ sortOrder: 1, publishedAt: -1 })
    .limit(50)
    .select("title text linkUrl linkLabel startDate endDate")
    .lean();

  return list
    .filter((b) => campaignPhase(b, now) === "ACTIVE")
    .slice(0, MAX_PUBLIC_BANNERS)
    .map((b) => {
      const link = safeBannerLink(b.linkUrl);
      return {
        id: b._id.toString(),
        title: b.title,
        text: b.text,
        linkUrl: link || "",
        linkLabel: link ? b.linkLabel || DEFAULT_LINK_LABEL : "",
        internal: link ? isInternalLink(link) : false,
      };
    });
}
`);

write("actions/banners.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { campaignPhase, validateDates } from "@/lib/campaignRules";
import {
  BANNER_STATUSES,
  BANNER_STATUS_FROM,
  DEFAULT_LINK_LABEL,
  MAX_LINK_LABEL,
  safeBannerLink,
} from "@/lib/bannerRules";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid banner");

const shared = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80, "Title is too long (80 characters maximum)"),
  text: z.string().trim().min(10, "Text must be at least 10 characters").max(200, "Text is too long (200 characters maximum)"),
  linkUrl: z.string().trim().max(200, "Link is too long (200 characters maximum)"),
  linkLabel: z.string().trim(),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ bannerId: objectId }, shared));

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    text: String(formData.get("text") || ""),
    linkUrl: String(formData.get("linkUrl") || ""),
    linkLabel: String(formData.get("linkLabel") || ""),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

// Returns { url, label } with safe values, or { error }.
function readLink(url, label) {
  if (!url) return { url: "", label: "" };
  const safe = safeBannerLink(url);
  if (!safe) {
    return { error: "The link must be a path on this site (such as /rewards) or a full https:// address." };
  }
  const finalLabel = label || DEFAULT_LINK_LABEL;
  if (finalLabel.length > MAX_LINK_LABEL) {
    return { error: "The link label is too long (" + MAX_LINK_LABEL + " characters maximum)." };
  }
  return { url: safe, label: finalLabel };
}

function refresh() {
  revalidatePath("/admin/banners");
  revalidatePath("/", "layout");
}

export async function createBannerAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };
  const link = readLink(d.linkUrl, d.linkLabel);
  if (link.error) return { error: link.error };

  try {
    await connectDB();
    const created = await Banner.create({
      title: d.title,
      text: d.text,
      linkUrl: link.url,
      linkLabel: link.label,
      startDate: d.startDate || undefined,
      endDate: d.endDate || undefined,
      sortOrder: d.sortOrder,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "banner.create",
      targetType: "Banner",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Create banner failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner saved as a draft. It is not public until you publish it." };
}

export async function updateBannerAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ bannerId: String(formData.get("bannerId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };
  const link = readLink(d.linkUrl, d.linkLabel);
  if (link.error) return { error: link.error };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Banner.findOneAndUpdate(
      { _id: d.bannerId, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          title: d.title,
          text: d.text,
          linkUrl: link.url,
          linkLabel: link.label,
          startDate: d.startDate,
          endDate: d.endDate,
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft banner can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "banner.update",
      targetType: "Banner",
      targetId: d.bannerId,
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Update banner failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner updated." };
}

const statusSchema = z.object({
  bannerId: objectId,
  target: z.enum(BANNER_STATUSES, { message: "Invalid status" }),
});

export async function setBannerStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    bannerId: String(formData.get("bannerId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { bannerId: id, target } = parsed.data;

  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Banner.findOne({ _id: id, deletedAt: null }).select("startDate endDate").lean();
      if (!current) return { error: "Banner not found." };
      if (campaignPhase(current) === "ENDED") {
        return { error: "This banner has already ended. Change its end date first." };
      }
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Banner.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: BANNER_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This banner cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "banner.status." + target.toLowerCase(),
      targetType: "Banner",
      targetId: id,
    });
  } catch (err) {
    console.error("Set banner status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Banner status updated." };
}
`);

write("components/forms/BannerForms.js", `
"use client";

import { useActionState } from "react";
import { createBannerAction, updateBannerAction, setBannerStatusAction } from "@/actions/banners";

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

// banner: { id, title, text, linkUrl, linkLabel, startDate, endDate, sortOrder }
function Fields({ idPrefix, banner }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={3} maxLength={80}
          defaultValue={banner ? banner.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-text"} className="mb-1 block text-sm font-medium">Text (10 to 200 characters)</label>
        <textarea id={idPrefix + "-text"} name="text" rows={2} required minLength={10} maxLength={200}
          defaultValue={banner ? banner.text : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-link"} className="mb-1 block text-sm font-medium">
            Link (optional): a path like /rewards or a full https:// address
          </label>
          <input id={idPrefix + "-link"} name="linkUrl" type="text" maxLength={200}
            defaultValue={banner ? banner.linkUrl : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-label"} className="mb-1 block text-sm font-medium">Link label (default: Learn more)</label>
          <input id={idPrefix + "-label"} name="linkLabel" type="text" maxLength={30}
            defaultValue={banner ? banner.linkLabel : ""} className={field} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={idPrefix + "-start"} className="mb-1 block text-sm font-medium">Start date (optional)</label>
          <input id={idPrefix + "-start"} name="startDate" type="date"
            defaultValue={banner ? banner.startDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-end"} className="mb-1 block text-sm font-medium">End date (optional)</label>
          <input id={idPrefix + "-end"} name="endDate" type="date"
            defaultValue={banner ? banner.endDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-order"} className="mb-1 block text-sm font-medium">Order (smaller shows first)</label>
          <input id={idPrefix + "-order"} name="sortOrder" type="number" required min={0} max={1000} step={1}
            defaultValue={banner ? banner.sortOrder : 100} className={field} />
        </div>
      </div>
    </>
  );
}

export default function BannerForm() {
  const [state, formAction, pending] = useActionState(createBannerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-banner" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save banner (draft)"}
      </button>
    </form>
  );
}

export function EditBannerForm({ banner }) {
  const [state, formAction, pending] = useActionState(updateBannerAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="bannerId" value={banner.id} />
      <Fields idPrefix={"edit-banner-" + banner.id} banner={banner} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function BannerStatusButton({ bannerId, target, label }) {
  const [state, formAction, pending] = useActionState(setBannerStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="bannerId" value={bannerId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("app/admin/(panel)/banners/page.js", `
import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { campaignPhase, PHASE_LABELS } from "@/lib/campaignRules";
import {
  BANNER_STATUSES,
  BANNER_STATUS_LABELS,
  BANNER_TARGET_LABELS,
  MAX_PUBLIC_BANNERS,
  bannerTargets,
} from "@/lib/bannerRules";
import BannerForm, { EditBannerForm, BannerStatusButton } from "@/components/forms/BannerForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Banners | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/banners" + (status ? "?status=" + status : "");
}

export default async function AdminBannersPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = BANNER_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load banners failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    BANNER_STATUSES.map((s) => ({ label: BANNER_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Banners</h1>
        <p className="mt-1 text-sm text-gray-600">
          Published banners that are running now appear under the announcements on every public page. At most{" "}
          {MAX_PUBLIC_BANNERS} are shown, in the order given. A banner can be edited only while it is a draft. Images are
          not part of this version. Dates are UTC days.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Banners could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No banners match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((b) => {
              const id = b._id.toString();
              const plain = {
                id: id,
                title: b.title,
                text: b.text,
                linkUrl: b.linkUrl || "",
                linkLabel: b.linkLabel || "",
                startDate: b.startDate || "",
                endDate: b.endDate || "",
                sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 100,
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <StatusBadge status={b.status} label={BANNER_STATUS_LABELS[b.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{b.text}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Order: {plain.sortOrder} | Link: {b.linkUrl ? b.linkUrl : "none"} | Dates: {b.startDate || "no start"} to{" "}
                    {b.endDate || "no end"}
                    {b.status === "PUBLISHED" ? " | " + PHASE_LABELS[campaignPhase(b)] : ""}
                    {b.publishedAt ? " | Published " + formatDateTime(b.publishedAt) : ""}
                    {b.publishedBy ? " by " + b.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {bannerTargets(b.status).map((t) => (
                      <BannerStatusButton key={t} bannerId={id} target={t} label={BANNER_TARGET_LABELS[t]} />
                    ))}
                  </div>
                  {b.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditBannerForm banner={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a banner</h2>
        <BannerForm />
      </section>
    </div>
  );
}
`);

write("app/(public)/layout.js", `
import Link from "next/link";
import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";
import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";
import { listPublicBanners } from "@/services/banners";

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

// A banner problem must never stop the public pages from opening.
async function loadBanners() {
  try {
    return await listPublicBanners();
  } catch (err) {
    console.error("Load banners failed:", err.message);
    return [];
  }
}

const linkClass = "ml-2 font-semibold text-emerald-900 underline";

export default async function PublicLayout({ children }) {
  const [announcements, banners] = await Promise.all([loadAnnouncements(), loadBanners()]);

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
      {banners.length > 0 && (
        <section aria-label="Featured notices" className="border-b border-gray-200 bg-white">
          <ul className="mx-auto max-w-6xl space-y-2 px-4 py-3">
            {banners.map((b) => (
              <li key={b.id} className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
                <span className="font-semibold">{b.title}</span> {b.text}
                {b.linkUrl && b.internal && (
                  <Link href={b.linkUrl} className={linkClass}>{b.linkLabel}</Link>
                )}
                {b.linkUrl && !b.internal && (
                  <a href={b.linkUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{b.linkLabel}</a>
                )}
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

write("tests/unit/bannerRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  BANNER_STATUSES,
  BANNER_STATUS_LABELS,
  BANNER_STATUS_FROM,
  MAX_PUBLIC_BANNERS,
  bannerTargets,
  safeBannerLink,
  isInternalLink,
} from "@/lib/bannerRules";

describe("banner status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    BANNER_STATUSES.forEach((s) => expect(BANNER_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(BANNER_STATUS_FROM).forEach(([to, froms]) => {
      expect(BANNER_STATUSES).toContain(to);
      froms.forEach((f) => expect(BANNER_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(bannerTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(bannerTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(bannerTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(bannerTargets("MADE_UP")).toEqual([]);
    expect(MAX_PUBLIC_BANNERS).toBe(3);
  });
});

describe("safeBannerLink", () => {
  it("keeps paths inside the site", () => {
    expect(safeBannerLink("/rewards")).toBe("/rewards");
    expect(safeBannerLink("/admin/orders?status=PENDING")).toBe("/admin/orders?status=PENDING");
    expect(safeBannerLink("  /services  ")).toBe("/services");
    expect(safeBannerLink("/")).toBe("/");
  });

  it("keeps a normal https address", () => {
    expect(safeBannerLink("https://example.org/page")).toBe("https://example.org/page");
  });

  it("drops script links, http links, protocol-relative links and links with a password", () => {
    [
      "javascript:alert(1)",
      "data:text/html,hi",
      "http://example.org",
      "//evil.example",
      "https://user:pw@example.org",
      "https://localhost",
      "example.org",
      "ftp://example.org/file",
    ].forEach((v) => expect(safeBannerLink(v)).toBeUndefined());
  });

  it("drops odd characters, empty, non-text and very long values", () => {
    ["/ok<script>", "/a b", "", "   ", null, undefined, 42, "/" + "a".repeat(300)].forEach((v) => {
      expect(safeBannerLink(v)).toBeUndefined();
    });
  });

  it("tells internal links from external ones", () => {
    expect(isInternalLink("/rewards")).toBe(true);
    expect(isInternalLink("https://example.org")).toBe(false);
    expect(isInternalLink("//evil.example")).toBe(false);
    expect(isInternalLink(undefined)).toBe(false);
  });
});
`);

write("tests/integration/banners.test.js", `
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
    if ((code.match(/requireActionPermission\("content.publish"\)/g) || []).length < 3) {
      problems.push("every action must check content.publish");
    }
    if (!code.includes("safeBannerLink")) problems.push("links must go through safeBannerLink");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/banners/page.js" && !code.includes('requirePermission("content.publish")')) {
    problems.push("missing page permission check");
  }
  if (f === "services/banners.js") {
    if (!code.includes('status: "PUBLISHED"')) problems.push("public list must only read published banners");
    if (!code.includes("safeBannerLink")) problems.push("public list must re-check every link");
  }
  if (f === "app/(public)/layout.js") {
    if (!code.includes("loadAnnouncements") || !code.includes("listPublicBanners")) {
      problems.push("layout must show announcements and banners");
    }
    if (code.includes('target="_blank"') && !code.includes('rel="noopener noreferrer"')) {
      problems.push("external links need rel noopener noreferrer");
    }
  }
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention. The old layout is saved in " + backupDir);
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");