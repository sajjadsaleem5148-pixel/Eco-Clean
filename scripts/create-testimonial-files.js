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
  "lib/navigation.js",
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

write("lib/testimonialRules.js", `
export const TESTIMONIAL_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const TESTIMONIAL_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const TESTIMONIAL_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const TESTIMONIAL_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const MAX_PUBLIC_TESTIMONIALS = 12;
export const QUOTE_MIN = 20;
export const QUOTE_MAX = 400;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const DETAIL_MAX = 80;
export const CONSENT_NOTE_MIN = 5;
export const CONSENT_NOTE_MAX = 200;

export function testimonialTargets(status) {
  return TESTIMONIAL_STATUSES.filter((t) => TESTIMONIAL_STATUS_FROM[t].includes(status));
}

export function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// No angle brackets and no control characters in any public text.
export function hasUnsafeCharacters(value) {
  return /[<>\\u0000-\\u001f\\u007f]/.test(String(value == null ? "" : value));
}

export function isValidQuote(value) {
  const text = normalizeText(value);
  return text.length >= QUOTE_MIN && text.length <= QUOTE_MAX && !hasUnsafeCharacters(text);
}

// A name needs at least one letter or number.
export function isValidPersonName(value) {
  const name = normalizeText(value);
  if (name.length < NAME_MIN || name.length > NAME_MAX) return false;
  if (hasUnsafeCharacters(name)) return false;
  return /[\\p{L}\\p{N}]/u.test(name);
}

export function isValidDetail(value) {
  const text = normalizeText(value);
  return text.length <= DETAIL_MAX && !hasUnsafeCharacters(text);
}
`);

write("models/Testimonial.js", `
import mongoose from "mongoose";
import { TESTIMONIAL_STATUSES } from "@/lib/testimonialRules";

const testimonialSchema = new mongoose.Schema(
  {
    quote: { type: String, required: true, trim: true, maxlength: 400 },
    authorName: { type: String, required: true, trim: true, maxlength: 80 },
    authorDetail: { type: String, trim: true, maxlength: 80 },
    // Only a record that the person agreed. The app cannot verify it.
    consentConfirmed: { type: Boolean, default: false },
    consentNote: { type: String, trim: true, maxlength: 200 },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: TESTIMONIAL_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Testimonial || mongoose.model("Testimonial", testimonialSchema);
`);

write("services/testimonials.js", `
import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import { MAX_PUBLIC_TESTIMONIALS } from "@/lib/testimonialRules";

// For the public page. Only published testimonials with recorded consent are read,
// and only the three public fields are selected.
export async function listPublicTestimonials() {
  await connectDB();
  const list = await Testimonial.find({ status: "PUBLISHED", consentConfirmed: true, deletedAt: null })
    .sort({ sortOrder: 1, publishedAt: -1 })
    .limit(MAX_PUBLIC_TESTIMONIALS)
    .select("quote authorName authorDetail")
    .lean();

  return list.map((t) => ({
    id: t._id.toString(),
    quote: t.quote,
    authorName: t.authorName,
    authorDetail: t.authorDetail || "",
  }));
}
`);

write("actions/testimonials.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_FROM,
  QUOTE_MIN,
  QUOTE_MAX,
  NAME_MIN,
  NAME_MAX,
  DETAIL_MAX,
  CONSENT_NOTE_MIN,
  CONSENT_NOTE_MAX,
  normalizeText,
  isValidQuote,
  isValidPersonName,
  isValidDetail,
} from "@/lib/testimonialRules";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid testimonial");

const shared = {
  quote: z.string().trim().min(QUOTE_MIN, "The quote must be at least " + QUOTE_MIN + " characters").max(QUOTE_MAX, "The quote is too long (" + QUOTE_MAX + " characters maximum)"),
  authorName: z.string().trim().min(NAME_MIN, "Name must be at least " + NAME_MIN + " characters").max(NAME_MAX, "Name is too long (" + NAME_MAX + " characters maximum)"),
  authorDetail: z.string().trim().max(DETAIL_MAX, "The role or place is too long (" + DETAIL_MAX + " characters maximum)"),
  consentNote: z.string().trim().min(CONSENT_NOTE_MIN, "Write how consent was given (at least " + CONSENT_NOTE_MIN + " characters)").max(CONSENT_NOTE_MAX, "The consent note is too long (" + CONSENT_NOTE_MAX + " characters maximum)"),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ testimonialId: objectId }, shared));

function readFields(formData) {
  return {
    quote: String(formData.get("quote") || ""),
    authorName: String(formData.get("authorName") || ""),
    authorDetail: String(formData.get("authorDetail") || ""),
    consentNote: String(formData.get("consentNote") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

// Returns an error message, or null when the text is fine.
function checkText(d, consent) {
  if (!consent) return "Confirm that the person agreed to be quoted.";
  if (!isValidQuote(d.quote)) return "The quote must not contain < or > characters.";
  if (!isValidPersonName(d.authorName)) return "Enter a valid name. It needs a letter or number and no < or > characters.";
  if (!isValidDetail(d.authorDetail)) return "The role or place must not contain < or > characters.";
  return null;
}

function refresh() {
  revalidatePath("/admin/testimonials");
  revalidatePath("/testimonials");
}

export async function createTestimonialAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const consent = formData.get("consent") === "yes";
  const textError = checkText(d, consent);
  if (textError) return { error: textError };

  try {
    await connectDB();
    const created = await Testimonial.create({
      quote: normalizeText(d.quote),
      authorName: normalizeText(d.authorName),
      authorDetail: normalizeText(d.authorDetail),
      consentConfirmed: true,
      consentNote: normalizeText(d.consentNote),
      sortOrder: d.sortOrder,
      status: "DRAFT",
      createdBy: user.id,
    });
    // The audit entry never contains the quote or the name.
    await writeAudit({
      actor: user.id,
      action: "testimonial.create",
      targetType: "Testimonial",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create testimonial failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial saved as a draft. It is not public until you publish it." };
}

export async function updateTestimonialAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ testimonialId: String(formData.get("testimonialId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const consent = formData.get("consent") === "yes";
  const textError = checkText(d, consent);
  if (textError) return { error: textError };

  try {
    await connectDB();
    // Only a draft can be edited, so live text never changes without going back to draft first.
    const updated = await Testimonial.findOneAndUpdate(
      { _id: d.testimonialId, deletedAt: null, status: "DRAFT" },
      {
        $set: {
          quote: normalizeText(d.quote),
          authorName: normalizeText(d.authorName),
          authorDetail: normalizeText(d.authorDetail),
          consentConfirmed: true,
          consentNote: normalizeText(d.consentNote),
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Only a draft testimonial can be edited. Move it to draft first." };

    await writeAudit({
      actor: user.id,
      action: "testimonial.update",
      targetType: "Testimonial",
      targetId: d.testimonialId,
    });
  } catch (err) {
    console.error("Update testimonial failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial updated." };
}

const statusSchema = z.object({
  testimonialId: objectId,
  target: z.enum(TESTIMONIAL_STATUSES, { message: "Invalid status" }),
});

export async function setTestimonialStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    testimonialId: String(formData.get("testimonialId") || ""),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { testimonialId: id, target } = parsed.data;

  const filter = { _id: id, deletedAt: null, status: { $in: TESTIMONIAL_STATUS_FROM[target] } };
  const set = { status: target };

  try {
    await connectDB();

    if (target === "PUBLISHED") {
      const current = await Testimonial.findOne({ _id: id, deletedAt: null }).select("consentConfirmed").lean();
      if (!current) return { error: "Testimonial not found." };
      if (!current.consentConfirmed) {
        return { error: "Consent is not recorded for this testimonial, so it cannot be published." };
      }
      // The consent rule is part of the update filter too, so a race cannot skip it.
      filter.consentConfirmed = true;
      set.publishedBy = user.id;
      set.publishedAt = new Date();
    }

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Testimonial.findOneAndUpdate(filter, { $set: set }, { returnDocument: "after" }).select("_id");
    if (!updated) return { error: "This testimonial cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "testimonial.status." + target.toLowerCase(),
      targetType: "Testimonial",
      targetId: id,
    });
  } catch (err) {
    console.error("Set testimonial status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Testimonial status updated." };
}
`);

write("components/forms/TestimonialForms.js", `
"use client";

import { useActionState } from "react";
import {
  createTestimonialAction,
  updateTestimonialAction,
  setTestimonialStatusAction,
} from "@/actions/testimonials";

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

// item: { id, quote, authorName, authorDetail, consentNote, consent, sortOrder }
function Fields({ idPrefix, item }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-quote"} className="mb-1 block text-sm font-medium">
          What the person said (20 to 400 characters, their own words)
        </label>
        <textarea id={idPrefix + "-quote"} name="quote" rows={3} required minLength={20} maxLength={400}
          defaultValue={item ? item.quote : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-name"} className="mb-1 block text-sm font-medium">Name shown publicly</label>
          <input id={idPrefix + "-name"} name="authorName" type="text" required minLength={2} maxLength={80}
            defaultValue={item ? item.authorName : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-detail"} className="mb-1 block text-sm font-medium">Role or place (optional)</label>
          <input id={idPrefix + "-detail"} name="authorDetail" type="text" maxLength={80}
            defaultValue={item ? item.authorDetail : ""} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={idPrefix + "-consent-note"} className="mb-1 block text-sm font-medium">
          How the person gave consent (only staff see this)
        </label>
        <input id={idPrefix + "-consent-note"} name="consentNote" type="text" required minLength={5} maxLength={200}
          defaultValue={item ? item.consentNote : ""} className={field} />
      </div>
      <div className="flex items-start gap-2">
        <input id={idPrefix + "-consent"} name="consent" type="checkbox" value="yes" required
          defaultChecked={item ? item.consent : false} className="mt-1 h-5 w-5" />
        <label htmlFor={idPrefix + "-consent"} className="text-sm">
          I confirm that this person agreed to have these words and this name shown publicly.
        </label>
      </div>
      <div className="max-w-xs">
        <label htmlFor={idPrefix + "-order"} className="mb-1 block text-sm font-medium">Order (smaller shows first)</label>
        <input id={idPrefix + "-order"} name="sortOrder" type="number" required min={0} max={1000} step={1}
          defaultValue={item ? item.sortOrder : 100} className={field} />
      </div>
    </>
  );
}

export default function TestimonialForm() {
  const [state, formAction, pending] = useActionState(createTestimonialAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-testimonial" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save testimonial (draft)"}
      </button>
    </form>
  );
}

export function EditTestimonialForm({ item }) {
  const [state, formAction, pending] = useActionState(updateTestimonialAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="testimonialId" value={item.id} />
      <Fields idPrefix={"edit-testimonial-" + item.id} item={item} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function TestimonialStatusButton({ testimonialId, target, label }) {
  const [state, formAction, pending] = useActionState(setTestimonialStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="testimonialId" value={testimonialId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("app/admin/(panel)/testimonials/page.js", `
import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_LABELS,
  TESTIMONIAL_TARGET_LABELS,
  MAX_PUBLIC_TESTIMONIALS,
  testimonialTargets,
} from "@/lib/testimonialRules";
import TestimonialForm, {
  EditTestimonialForm,
  TestimonialStatusButton,
} from "@/components/forms/TestimonialForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Testimonials | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/testimonials" + (status ? "?status=" + status : "");
}

export default async function AdminTestimonialsPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = TESTIMONIAL_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Testimonial.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(100)
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load testimonials failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    TESTIMONIAL_STATUSES.map((s) => ({ label: TESTIMONIAL_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Testimonials</h1>
        <p className="mt-1 text-sm text-gray-600">
          Only enter words that a real person said and agreed to have shown publicly. The app records your confirmation
          but cannot check it. Published testimonials appear on the public Testimonials page (up to{" "}
          {MAX_PUBLIC_TESTIMONIALS}). A testimonial can be edited only while it is a draft. The consent note is never shown publicly.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Testimonials could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No testimonials match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((t) => {
              const id = t._id.toString();
              const plain = {
                id: id,
                quote: t.quote,
                authorName: t.authorName,
                authorDetail: t.authorDetail || "",
                consentNote: t.consentNote || "",
                consent: Boolean(t.consentConfirmed),
                sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : 100,
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{t.authorName}</p>
                    <StatusBadge status={t.status} label={TESTIMONIAL_STATUS_LABELS[t.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{t.quote}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Order: {plain.sortOrder} | Consent: {t.consentConfirmed ? "recorded" : "NOT recorded"}
                    {t.consentNote ? " (" + t.consentNote + ")" : ""}
                    {t.publishedAt ? " | Published " + formatDateTime(t.publishedAt) : ""}
                    {t.publishedBy ? " by " + t.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {testimonialTargets(t.status).map((target) => (
                      <TestimonialStatusButton
                        key={target}
                        testimonialId={id}
                        target={target}
                        label={TESTIMONIAL_TARGET_LABELS[target]}
                      />
                    ))}
                  </div>
                  {t.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditTestimonialForm item={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Add a testimonial</h2>
        <TestimonialForm />
      </section>
    </div>
  );
}
`);

write("app/(public)/testimonials/page.js", `
import { listPublicTestimonials } from "@/services/testimonials";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Testimonials | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function TestimonialsPage() {
  let items = [];
  let loadError = false;
  try {
    items = await listPublicTestimonials();
  } catch (err) {
    console.error("Load public testimonials failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">What people say</h1>
      <p className="mt-2 text-sm text-gray-700">
        Words from community members who agreed to be quoted.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Testimonials are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState>No testimonials have been published yet.</EmptyState>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-6 space-y-4">
          {items.map((t) => (
            <li key={t.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <blockquote className="text-sm leading-6 text-gray-800">{t.quote}</blockquote>
              <p className="mt-3 text-sm font-semibold text-emerald-900">
                {t.authorName}
                {t.authorDetail ? <span className="font-normal text-gray-600">, {t.authorDetail}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`);

write("tests/unit/testimonialRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_LABELS,
  TESTIMONIAL_STATUS_FROM,
  MAX_PUBLIC_TESTIMONIALS,
  testimonialTargets,
  normalizeText,
  hasUnsafeCharacters,
  isValidQuote,
  isValidPersonName,
  isValidDetail,
} from "@/lib/testimonialRules";

describe("testimonial status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    TESTIMONIAL_STATUSES.forEach((s) => expect(TESTIMONIAL_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(TESTIMONIAL_STATUS_FROM).forEach(([to, froms]) => {
      expect(TESTIMONIAL_STATUSES).toContain(to);
      froms.forEach((f) => expect(TESTIMONIAL_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(testimonialTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(testimonialTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(testimonialTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(testimonialTargets("MADE_UP")).toEqual([]);
    expect(MAX_PUBLIC_TESTIMONIALS).toBe(12);
  });
});

describe("text rules", () => {
  it("normalises spacing", () => {
    expect(normalizeText("  a   b \\n c ")).toBe("a b c");
    expect(normalizeText(null)).toBe("");
  });

  it("spots angle brackets and control characters", () => {
    expect(hasUnsafeCharacters("<b>x</b>")).toBe(true);
    expect(hasUnsafeCharacters("bad\\u0007text")).toBe(true);
    expect(hasUnsafeCharacters("A normal sentence.")).toBe(false);
  });

  it("accepts a quote of the right length and rejects short, long or bracketed ones", () => {
    expect(isValidQuote("The pickup was on time every week.")).toBe(true);
    expect(isValidQuote("too short")).toBe(false);
    expect(isValidQuote("x".repeat(401))).toBe(false);
    expect(isValidQuote("x".repeat(400))).toBe(true);
    expect(isValidQuote("This quote has <script> in it, sadly.")).toBe(false);
  });

  it("accepts normal names, including non-English ones, and rejects odd ones", () => {
    ["Ayesha Khan", "Jean-Luc O'Neil", "Al"].forEach((n) => expect(isValidPersonName(n)).toBe(true));
    expect(isValidPersonName("عائشہ خان")).toBe(true);
    ["", "a", "!!!", "<b>Bob</b>", "x".repeat(81)].forEach((n) => expect(isValidPersonName(n)).toBe(false));
  });

  it("allows an empty role or place but not brackets or a long text", () => {
    expect(isValidDetail("")).toBe(true);
    expect(isValidDetail("Shopkeeper, Zone A")).toBe(true);
    expect(isValidDetail("<i>x</i>")).toBe(false);
    expect(isValidDetail("x".repeat(81))).toBe(false);
  });
});
`);

write("tests/integration/testimonials.test.js", `
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
`);

// ---- Link patches (sidebar and footer), each with a backup. A missing anchor only gives a WARNING. ----
const backupDir = "scripts/backup-testimonials";
fs.mkdirSync(backupDir, { recursive: true });

function backupOnce(file) {
  const dest = path.join(backupDir, file.replace(/[\\/]/g, "__") + ".bak");
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
}

const patches = [];

// Sidebar: copy the existing Banners line and change its address and label.
{
  const file = "lib/navigation.js";
  const src = fs.readFileSync(file, "utf8");
  if (src.includes('"/admin/testimonials"')) {
    patches.push({ file: file, state: "already" });
  } else {
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    const lines = src.split(/\r?\n/);
    const hits = lines.map((l, i) => (l.includes('"/admin/banners"') ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) {
      patches.push({ file: file, state: "skipped", why: 'the "/admin/banners" line was not found exactly once' });
    } else {
      const copy = lines[hits[0]]
        .replace("/admin/banners", "/admin/testimonials")
        .replace(/label:\s*"[^"]*"/, 'label: "Testimonials"');
      backupOnce(file);
      lines.splice(hits[0] + 1, 0, copy);
      fs.writeFileSync(file, lines.join(eol), "utf8");
      patches.push({ file: file, state: "wired" });
    }
  }
}

// Footer: add a Testimonials link before the Contact link.
{
  const file = "components/layout/Footer.js";
  const anchor = '<li><Link href="/contact" className={linkClass}>Contact</Link></li>';
  const link = '<li><Link href="/testimonials" className={linkClass}>Testimonials</Link></li>';
  if (!fs.existsSync(file)) {
    patches.push({ file: file, state: "skipped", why: "file not found" });
  } else {
    const src = fs.readFileSync(file, "utf8");
    if (src.includes('"/testimonials"')) {
      patches.push({ file: file, state: "already" });
    } else if (src.split(anchor).length - 1 !== 1) {
      patches.push({ file: file, state: "skipped", why: "the Contact link was not found exactly once" });
    } else {
      const eol = src.includes("\r\n") ? "\r\n" : "\n";
      const at = src.indexOf(anchor);
      const lineStart = src.lastIndexOf("\n", at) + 1;
      const indent = src.slice(lineStart, at);
      backupOnce(file);
      fs.writeFileSync(file, src.replace(anchor, link + eol + indent + anchor), "utf8");
      patches.push({ file: file, state: "wired" });
    }
  }
}

console.log("\nLink patches:");
patches.forEach((p) => {
  if (p.state === "wired") console.log(" WIRED   " + p.file);
  else if (p.state === "already") console.log(" ALREADY " + p.file);
  else console.log(" WARNING " + p.file + " was NOT changed (" + p.why + ")");
});

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
    if (!code.includes("consentConfirmed")) problems.push("publishing must depend on recorded consent");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/testimonials/page.js" && !code.includes('requirePermission("content.publish")')) {
    problems.push("missing page permission check");
  }
  if (f === "app/(public)/testimonials/page.js" && /consentNote/.test(code)) {
    problems.push("public page must never show the consent note");
  }
  if (f === "services/testimonials.js") {
    if (!code.includes('status: "PUBLISHED"') || !code.includes("consentConfirmed: true")) {
      problems.push("public list must read only published testimonials with consent");
    }
    if (/consentNote|createdBy|publishedBy/.test(code)) problems.push("public list must not select internal fields");
  }
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

patches.forEach((p) => {
  if (p.state === "wired") {
    const after = fs.readFileSync(p.file, "utf8");
    if (!after.includes("/testimonials")) {
      console.log(" FAIL (link not found after writing): " + p.file);
      failed++;
    }
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention. Backups of changed files: " + backupDir);
  process.exit(1);
}
const skipped = patches.filter((p) => p.state === "skipped").length;
console.log("\nALL OK: " + written.length + " files written and checked.");
if (skipped > 0) {
  console.log("WARNING: " + skipped + " link(s) were not added. Send me the WARNING lines above.");
}
console.log("Next: npm test, npm run test:integration, npm run build.");