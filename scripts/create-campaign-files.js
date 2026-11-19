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

write("lib/campaignRules.js", `
export const CAMPAIGN_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const CAMPAIGN_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const CAMPAIGN_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function campaignTargets(status) {
  return CAMPAIGN_STATUSES.filter((t) => CAMPAIGN_STATUS_FROM[t].includes(status));
}

export const PHASE_LABELS = {
  ACTIVE: "Running now",
  UPCOMING: "Not started yet",
  ENDED: "Ended",
};

const DAY_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;

// A real calendar day written as YYYY-MM-DD.
export function isValidDay(value) {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const d = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayString(now) {
  return (now || new Date()).toISOString().slice(0, 10);
}

// Both dates are optional. Returns an error message, or null when the dates are fine.
export function validateDates(start, end) {
  const s = start || "";
  const e = end || "";
  if (s && !isValidDay(s)) return "The start date is not a valid date.";
  if (e && !isValidDay(e)) return "The end date is not a valid date.";
  if (s && e && s > e) return "The end date must not be before the start date.";
  return null;
}

// Dates are inclusive UTC days. A campaign with no dates is always running.
export function campaignPhase(campaign, now) {
  const today = todayString(now);
  const start = campaign && campaign.startDate ? campaign.startDate : "";
  const end = campaign && campaign.endDate ? campaign.endDate : "";
  if (start && today < start) return "UPCOMING";
  if (end && today > end) return "ENDED";
  return "ACTIVE";
}
`);

write("models/Campaign.js", `
import mongoose from "mongoose";
import { CAMPAIGN_STATUSES } from "@/lib/campaignRules";

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 2000 },
    startDate: { type: String },
    endDate: { type: String },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);
`);

write("services/campaigns.js", `
import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import { campaignPhase } from "@/lib/campaignRules";

const RANK = { ACTIVE: 0, UPCOMING: 1 };

// For the public page: only published campaigns that have not ended. Running ones come first.
export async function listPublicCampaigns(now) {
  await connectDB();
  const list = await Campaign.find({ status: "PUBLISHED", deletedAt: null })
    .sort({ publishedAt: -1 })
    .limit(100)
    .select("title summary body startDate endDate")
    .lean();

  return list
    .map((c) => ({
      id: c._id.toString(),
      title: c.title,
      summary: c.summary,
      body: c.body || "",
      startDate: c.startDate || "",
      endDate: c.endDate || "",
      phase: campaignPhase(c, now),
    }))
    .filter((c) => c.phase !== "ENDED")
    .sort((a, b) => RANK[a.phase] - RANK[b.phase]);
}
`);

write("actions/campaigns.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_FROM,
  campaignPhase,
  validateDates,
} from "@/lib/campaignRules";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid campaign");

const shared = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title is too long (120 characters maximum)"),
  summary: z.string().trim().min(10, "Summary must be at least 10 characters").max(200, "Summary is too long (200 characters maximum)"),
  body: z.string().trim().max(2000, "Details are too long (2000 characters maximum)"),
  startDate: z.string().trim(),
  endDate: z.string().trim(),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ campaignId: objectId }, shared));

function readFields(formData) {
  return {
    title: String(formData.get("title") || ""),
    summary: String(formData.get("summary") || ""),
    body: String(formData.get("body") || ""),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
  };
}

function refresh() {
  revalidatePath("/admin/campaigns");
  revalidatePath("/campaigns");
}

export async function createCampaignAction(prevState, formData) {
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

  try {
    await connectDB();
    const created = await Campaign.create({
      title: d.title,
      summary: d.summary,
      body: d.body,
      startDate: d.startDate || undefined,
      endDate: d.endDate || undefined,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "campaign.create",
      targetType: "Campaign",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Create campaign failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign saved as a draft. It is not public until you publish it." };
}

export async function updateCampaignAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ campaignId: String(formData.get("campaignId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const dateError = validateDates(d.startDate, d.endDate);
  if (dateError) return { error: dateError };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Campaign.findOneAndUpdate(
      { _id: d.campaignId, deletedAt: null, status: "DRAFT" },
      { $set: { title: d.title, summary: d.summary, body: d.body, startDate: d.startDate, endDate: d.endDate } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft campaign can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "campaign.update",
      targetType: "Campaign",
      targetId: d.campaignId,
      metadata: { title: d.title },
    });
  } catch (err) {
    console.error("Update campaign failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign updated." };
}

const statusSchema = z.object({
  campaignId: objectId,
  target: z.enum(CAMPAIGN_STATUSES, { message: "Invalid status" }),
});

export async function setCampaignStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    campaignId: String(formData.get("campaignId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { campaignId: id, target } = parsed.data;

  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Campaign.findOne({ _id: id, deletedAt: null }).select("startDate endDate").lean();
      if (!current) return { error: "Campaign not found." };
      if (campaignPhase(current) === "ENDED") {
        return { error: "This campaign has already ended. Change its end date first." };
      }
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Campaign.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: CAMPAIGN_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This campaign cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "campaign.status." + target.toLowerCase(),
      targetType: "Campaign",
      targetId: id,
    });
  } catch (err) {
    console.error("Set campaign status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Campaign status updated." };
}
`);

write("components/forms/CampaignForms.js", `
"use client";

import { useActionState } from "react";
import { createCampaignAction, updateCampaignAction, setCampaignStatusAction } from "@/actions/campaigns";

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

// campaign: { id, title, summary, body, startDate, endDate }
function Fields({ idPrefix, campaign }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={3} maxLength={120}
          defaultValue={campaign ? campaign.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-summary"} className="mb-1 block text-sm font-medium">Short summary (10 to 200 characters)</label>
        <textarea id={idPrefix + "-summary"} name="summary" rows={2} required minLength={10} maxLength={200}
          defaultValue={campaign ? campaign.summary : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-body"} className="mb-1 block text-sm font-medium">
          Details (optional, plain text; blank lines make new paragraphs)
        </label>
        <textarea id={idPrefix + "-body"} name="body" rows={5} maxLength={2000}
          defaultValue={campaign ? campaign.body : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-start"} className="mb-1 block text-sm font-medium">Start date (optional)</label>
          <input id={idPrefix + "-start"} name="startDate" type="date"
            defaultValue={campaign ? campaign.startDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-end"} className="mb-1 block text-sm font-medium">End date (optional)</label>
          <input id={idPrefix + "-end"} name="endDate" type="date"
            defaultValue={campaign ? campaign.endDate : ""} className={field} />
        </div>
      </div>
    </>
  );
}

export default function CampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaignAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-campaign" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save campaign (draft)"}
      </button>
    </form>
  );
}

export function EditCampaignForm({ campaign }) {
  const [state, formAction, pending] = useActionState(updateCampaignAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="campaignId" value={campaign.id} />
      <Fields idPrefix={"edit-campaign-" + campaign.id} campaign={campaign} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function CampaignStatusButton({ campaignId, target, label }) {
  const [state, formAction, pending] = useActionState(setCampaignStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("app/admin/(panel)/campaigns/page.js", `
import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TARGET_LABELS,
  PHASE_LABELS,
  campaignTargets,
  campaignPhase,
} from "@/lib/campaignRules";
import CampaignForm, { EditCampaignForm, CampaignStatusButton } from "@/components/forms/CampaignForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Campaigns | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/campaigns" + (status ? "?status=" + status : "");
}

export default async function AdminCampaignsPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = CAMPAIGN_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Campaign.find(filter).sort({ createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load campaigns failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    CAMPAIGN_STATUSES.map((s) => ({ label: CAMPAIGN_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-600">
          Only published campaigns that have not ended appear on the public Campaigns page. A campaign can be edited
          only while it is a draft. Campaigns are not linked to points, rewards or reports yet. Dates are UTC days.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Campaigns could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No campaigns match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((c) => {
              const id = c._id.toString();
              const plain = {
                id: id,
                title: c.title,
                summary: c.summary,
                body: c.body || "",
                startDate: c.startDate || "",
                endDate: c.endDate || "",
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{c.title}</p>
                    <StatusBadge status={c.status} label={CAMPAIGN_STATUS_LABELS[c.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{c.summary}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Dates: {c.startDate || "no start"} to {c.endDate || "no end"}
                    {c.status === "PUBLISHED" ? " | " + PHASE_LABELS[campaignPhase(c)] : ""}
                    {c.publishedAt ? " | Published " + formatDateTime(c.publishedAt) : ""}
                    {c.publishedBy ? " by " + c.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {campaignTargets(c.status).map((t) => (
                      <CampaignStatusButton key={t} campaignId={id} target={t} label={CAMPAIGN_TARGET_LABELS[t]} />
                    ))}
                  </div>
                  {c.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditCampaignForm campaign={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a campaign</h2>
        <CampaignForm />
      </section>
    </div>
  );
}
`);

write("app/(public)/campaigns/page.js", `
import { listPublicCampaigns } from "@/services/campaigns";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Campaigns | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  let campaigns = [];
  let loadError = false;
  try {
    campaigns = await listPublicCampaigns();
  } catch (err) {
    console.error("Load public campaigns failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Community Campaigns</h1>
      <p className="mt-2 text-sm text-gray-700">
        Current and upcoming campaigns published by ECO-CLEAN staff.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Campaigns are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && campaigns.length === 0 && (
        <div className="mt-6">
          <EmptyState>There are no campaigns right now.</EmptyState>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="mt-6 space-y-4">
          {campaigns.map((c) => (
            <section key={c.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{c.title}</h2>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                {c.phase === "UPCOMING" ? "Starts on " + c.startDate : "Running now"}
                {c.endDate ? " | Ends on " + c.endDate : ""}
              </p>
              <p className="mt-2 text-sm text-gray-800">{c.summary}</p>
              {c.body && <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{c.body}</div>}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
`);

write("tests/unit/campaignRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_FROM,
  campaignTargets,
  isValidDay,
  validateDates,
  campaignPhase,
} from "@/lib/campaignRules";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("campaign status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    CAMPAIGN_STATUSES.forEach((s) => expect(CAMPAIGN_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(CAMPAIGN_STATUS_FROM).forEach(([to, froms]) => {
      expect(CAMPAIGN_STATUSES).toContain(to);
      froms.forEach((f) => expect(CAMPAIGN_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(campaignTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(campaignTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(campaignTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(campaignTargets("MADE_UP")).toEqual([]);
  });
});

describe("dates", () => {
  it("accepts only real days written as YYYY-MM-DD", () => {
    expect(isValidDay("2026-11-20")).toBe(true);
    ["2026-02-30", "2026-13-01", "2026-1-5", "abc", "", null, undefined].forEach((v) => {
      expect(isValidDay(v)).toBe(false);
    });
  });

  it("accepts empty dates and a sensible range", () => {
    expect(validateDates("", "")).toBeNull();
    expect(validateDates("2026-11-01", "")).toBeNull();
    expect(validateDates("", "2026-11-30")).toBeNull();
    expect(validateDates("2026-11-01", "2026-11-01")).toBeNull();
  });

  it("rejects bad dates and an end before the start", () => {
    expect(validateDates("2026-02-30", "")).toMatch(/start date/i);
    expect(validateDates("", "nope")).toMatch(/end date/i);
    expect(validateDates("2026-11-10", "2026-11-09")).toMatch(/must not be before/i);
  });
});

describe("campaignPhase", () => {
  it("is running when there are no dates", () => {
    expect(campaignPhase({}, NOW)).toBe("ACTIVE");
  });

  it("is upcoming before the start date and running on it", () => {
    expect(campaignPhase({ startDate: "2026-11-21" }, NOW)).toBe("UPCOMING");
    expect(campaignPhase({ startDate: "2026-11-20" }, NOW)).toBe("ACTIVE");
  });

  it("is running on the end date and ended after it", () => {
    expect(campaignPhase({ endDate: "2026-11-20" }, NOW)).toBe("ACTIVE");
    expect(campaignPhase({ endDate: "2026-11-19" }, NOW)).toBe("ENDED");
  });

  it("uses both dates together", () => {
    expect(campaignPhase({ startDate: "2026-11-01", endDate: "2026-11-30" }, NOW)).toBe("ACTIVE");
    expect(campaignPhase({ startDate: "2026-12-01", endDate: "2026-12-31" }, NOW)).toBe("UPCOMING");
    expect(campaignPhase({ startDate: "2026-10-01", endDate: "2026-10-31" }, NOW)).toBe("ENDED");
  });
});
`);

write("tests/integration/campaigns.test.js", `
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
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if ((src.match(/requireActionPermission\("content.publish"\)/g) || []).length < 3) {
      problems.push("every action must check content.publish");
    }
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/campaigns/page.js" && !src.includes('requirePermission("content.publish")')) {
    problems.push("missing page permission check");
  }
  if (f === "services/campaigns.js" && !src.includes('status: "PUBLISHED"')) {
    problems.push("public list must only read published campaigns");
  }
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");