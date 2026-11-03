const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/contentStatus.js", `
export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const CONTENT_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const CONTENT_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const CONTENT_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function contentTargets(status) {
  return CONTENT_STATUSES.filter((t) => CONTENT_STATUS_FROM[t].includes(status));
}

export const SERVICE_CATEGORIES = {
  RESIDENTIAL: "Residential waste collection",
  COMMUNITY: "Community waste collection",
  COMMERCIAL: "Commercial waste collection",
  OFFICE: "Office waste management",
  EVENT_CLEANUP: "Event cleanup",
  EDUCATION: "Waste segregation education",
  RECYCLING: "Recycling coordination",
  COMPOSTING: "Organic waste and composting",
  CAMPAIGNS: "Community cleanliness campaigns",
  BAG_DISTRIBUTION: "Bag and container distribution",
};

export const ELIGIBLE_LABELS = {
  RESIDENT: "Residents",
  COMMERCIAL: "Businesses and institutions",
  ALL: "Residents and businesses",
};
`);

write("models/Service.js", `
import mongoose from "mongoose";
import { CONTENT_STATUSES, SERVICE_CATEGORIES } from "@/lib/contentStatus";

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, enum: Object.keys(SERVICE_CATEGORIES), required: true, index: true },
    eligibleCustomer: { type: String, enum: ["RESIDENT", "COMMERCIAL", "ALL"], default: "ALL" },
    availability: { type: String, trim: true, maxlength: 300 },
    collectionInstructions: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: CONTENT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Service || mongoose.model("Service", serviceSchema);
`);

write("models/FAQ.js", `
import mongoose from "mongoose";
import { CONTENT_STATUSES } from "@/lib/contentStatus";

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    answer: { type: String, required: true, trim: true, maxlength: 2000 },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: CONTENT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.FAQ || mongoose.model("FAQ", faqSchema);
`);

write("actions/content.js", `
"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import FAQ from "@/models/FAQ";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CONTENT_STATUSES, CONTENT_STATUS_FROM, SERVICE_CATEGORIES } from "@/lib/contentStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid item");

function makeSlug(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return base || "service";
}

function refresh() {
  revalidatePath("/services");
  revalidatePath("/admin/services");
  revalidatePath("/admin/faqs");
}

const serviceSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().trim().min(20, "Description must be at least 20 characters").max(2000),
  category: z.enum(Object.keys(SERVICE_CATEGORIES), { message: "Please choose a category" }),
  eligibleCustomer: z.enum(["RESIDENT", "COMMERCIAL", "ALL"], { message: "Please choose who is eligible" }),
  availability: z.string().trim().max(300).optional(),
  collectionInstructions: z.string().trim().max(1000).optional(),
});

export async function createServiceAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = serviceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    eligibleCustomer: formData.get("eligibleCustomer"),
    availability: formData.get("availability") || undefined,
    collectionInstructions: formData.get("collectionInstructions") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    let slug = makeSlug(d.title);
    if (await Service.exists({ slug })) {
      slug = slug + "-" + crypto.randomBytes(2).toString("hex");
    }
    const created = await Service.create({ ...d, slug, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "service.create",
      targetType: "Service",
      targetId: created._id.toString(),
      metadata: { title: d.title },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A service with this title already exists." };
    console.error("Create service failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Service created as a draft. Publish it when it is ready." };
}

const statusSchema = z.object({
  kind: z.enum(["service", "faq"]),
  id: objectId,
  target: z.enum(CONTENT_STATUSES, { message: "Invalid status" }),
});

export async function setContentStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { kind, id, target } = parsed.data;

  const Model = kind === "service" ? Service : FAQ;
  const set = { status: target };
  if (target === "PUBLISHED") {
    set.publishedBy = user.id;
    set.publishedAt = new Date();
  }

  try {
    await connectDB();
    const updated = await Model.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: CONTENT_STATUS_FROM[target] } },
      { $set: set },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This item cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: kind + "." + target.toLowerCase(),
      targetType: kind === "service" ? "Service" : "FAQ",
      targetId: id,
    });
  } catch (err) {
    console.error("Set content status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Updated." };
}

const faqSchema = z.object({
  question: z.string().trim().min(5, "Question must be at least 5 characters").max(200),
  answer: z.string().trim().min(10, "Answer must be at least 10 characters").max(2000),
  sortOrder: z.coerce.number().int("Use a whole number").min(0).max(100000),
});

export async function createFaqAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = faqSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const created = await FAQ.create({ ...parsed.data, status: "DRAFT", createdBy: user.id });
    await writeAudit({
      actor: user.id,
      action: "faq.create",
      targetType: "FAQ",
      targetId: created._id.toString(),
    });
  } catch (err) {
    console.error("Create FAQ failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "FAQ created as a draft. Publish it when it is ready." };
}
`);

write("components/forms/ContentForms.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import { createServiceAction, createFaqAction, setContentStatusAction } from "@/actions/content";

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

export function ServiceForm({ categories, eligibles }) {
  const [state, formAction, pending] = useActionState(createServiceAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="sv-title" className="mb-1 block text-sm font-medium">Title</label>
        <input id="sv-title" name="title" type="text" required minLength={3} maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="sv-desc" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="sv-desc" name="description" rows={4} required minLength={20} maxLength={2000} className={field} />
      </div>
      <div>
        <label htmlFor="sv-cat" className="mb-1 block text-sm font-medium">Category</label>
        <select id="sv-cat" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sv-elig" className="mb-1 block text-sm font-medium">Eligible customers</label>
        <select id="sv-elig" name="eligibleCustomer" required defaultValue="ALL" className={field}>
          {eligibles.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sv-avail" className="mb-1 block text-sm font-medium">Availability (optional, for example which zones)</label>
        <input id="sv-avail" name="availability" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="sv-instr" className="mb-1 block text-sm font-medium">Collection instructions (optional)</label>
        <textarea id="sv-instr" name="collectionInstructions" rows={3} maxLength={1000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create service (draft)"}
      </button>
    </form>
  );
}

export function FaqForm() {
  const [state, formAction, pending] = useActionState(createFaqAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="fq-q" className="mb-1 block text-sm font-medium">Question</label>
        <input id="fq-q" name="question" type="text" required minLength={5} maxLength={200} className={field} />
      </div>
      <div>
        <label htmlFor="fq-a" className="mb-1 block text-sm font-medium">Answer</label>
        <textarea id="fq-a" name="answer" rows={4} required minLength={10} maxLength={2000} className={field} />
      </div>
      <div>
        <label htmlFor="fq-o" className="mb-1 block text-sm font-medium">Order (smaller numbers appear first)</label>
        <input id="fq-o" name="sortOrder" type="number" required min={0} max={100000} step={1} defaultValue={100} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create FAQ (draft)"}
      </button>
    </form>
  );
}

export function ContentStatusButton({ kind, id, target, label }) {
  const [state, formAction, pending] = useActionState(setContentStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="kind" value={kind} />
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

write("app/admin/(panel)/services/page.js", `
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  SERVICE_CATEGORIES,
  ELIGIBLE_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TARGET_LABELS,
  contentTargets,
} from "@/lib/contentStatus";
import { ServiceForm, ContentStatusButton } from "@/components/forms/ContentForms";

export const metadata = { title: "Services | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requirePermission("content.publish");

  let services = [];
  let loadError = false;
  try {
    await connectDB();
    services = await Service.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load services failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(SERVICE_CATEGORIES).map(([value, label]) => ({ value, label }));
  const eligibles = Object.entries(ELIGIBLE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="mt-1 text-sm text-gray-600">
          New services start as drafts. Only published services appear on the public Services page.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Services could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && services.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No services yet. Create the first one below.
          </p>
        )}

        {services.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Title</th>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Eligible</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Published by</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{s.title}</td>
                    <td className="py-2 pr-4">{SERVICE_CATEGORIES[s.category] || s.category}</td>
                    <td className="py-2 pr-4">{ELIGIBLE_LABELS[s.eligibleCustomer]}</td>
                    <td className="py-2 pr-4">{CONTENT_STATUS_LABELS[s.status] || s.status}</td>
                    <td className="py-2 pr-4">{s.publishedBy ? s.publishedBy.name : "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {contentTargets(s.status).map((t) => (
                          <ContentStatusButton
                            key={t}
                            kind="service"
                            id={s._id.toString()}
                            target={t}
                            label={CONTENT_TARGET_LABELS[t]}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a service</h2>
        <ServiceForm categories={categories} eligibles={eligibles} />
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/faqs/page.js", `
import connectDB from "@/lib/db/connect";
import FAQ from "@/models/FAQ";
import { requirePermission } from "@/lib/auth/guards";
import { CONTENT_STATUS_LABELS, CONTENT_TARGET_LABELS, contentTargets } from "@/lib/contentStatus";
import { FaqForm, ContentStatusButton } from "@/components/forms/ContentForms";

export const metadata = { title: "FAQs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminFaqsPage() {
  await requirePermission("content.publish");

  let faqs = [];
  let loadError = false;
  try {
    await connectDB();
    faqs = await FAQ.find({ deletedAt: null }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load FAQs failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">FAQs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Published FAQs appear at the bottom of the public Services page.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            FAQs could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && faqs.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No FAQs yet. Create the first one below.
          </p>
        )}

        {faqs.length > 0 && (
          <ul className="mt-4 space-y-3">
            {faqs.map((f) => (
              <li key={f._id.toString()} className="rounded-md border border-gray-200 p-4">
                <p className="font-semibold">{f.question}</p>
                <p className="mt-1 text-sm text-gray-700">{f.answer}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Status: {CONTENT_STATUS_LABELS[f.status] || f.status} | Order: {f.sortOrder}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contentTargets(f.status).map((t) => (
                    <ContentStatusButton
                      key={t}
                      kind="faq"
                      id={f._id.toString()}
                      target={t}
                      label={CONTENT_TARGET_LABELS[t]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a FAQ</h2>
        <FaqForm />
      </section>
    </div>
  );
}
`);

write("app/(public)/services/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import FAQ from "@/models/FAQ";
import { SERVICE_CATEGORIES, ELIGIBLE_LABELS } from "@/lib/contentStatus";

export const metadata = { title: "Services | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  let services = [];
  let faqs = [];
  let loadError = false;
  try {
    await connectDB();
    [services, faqs] = await Promise.all([
      Service.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ title: 1 })
        .select("title slug category eligibleCustomer")
        .lean(),
      FAQ.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ sortOrder: 1, createdAt: 1 })
        .select("question answer")
        .lean(),
    ]);
  } catch (err) {
    console.error("Load services failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Services</h1>
      <p className="mt-2 text-sm text-gray-700">
        Availability depends on your service zone and on staff and vehicle capacity.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Services are temporarily unavailable. Please try again later.
        </p>
      )}
      {!loadError && services.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No services have been published yet.
        </p>
      )}

      {services.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{SERVICE_CATEGORIES[s.category] || s.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/services/" + s.slug} className="text-emerald-900 underline">{s.title}</Link>
              </h2>
              <p className="mt-1 text-sm text-gray-700">For: {ELIGIBLE_LABELS[s.eligibleCustomer]}</p>
            </li>
          ))}
        </ul>
      )}

      {faqs.length > 0 && (
        <section className="mt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-bold text-emerald-900">Frequently asked questions</h2>
          <div className="mt-4 space-y-3">
            {faqs.map((f) => (
              <details key={f._id.toString()} className="rounded-md border border-gray-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold">{f.question}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
`);

write("app/(public)/services/[slug]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import { SERVICE_CATEGORIES, ELIGIBLE_LABELS } from "@/lib/contentStatus";

export const metadata = { title: "Service | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) notFound();

  let service = null;
  try {
    await connectDB();
    service = await Service.findOne({ slug, status: "PUBLISHED", deletedAt: null })
      .select("title description category eligibleCustomer availability collectionInstructions")
      .lean();
  } catch (err) {
    console.error("Load service failed:", err.message);
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This service could not be loaded. Please try again later.
        </p>
      </main>
    );
  }

  if (!service) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/services" className="text-sm font-semibold text-emerald-800 underline">Back to services</Link>
      <p className="mt-3 text-sm font-semibold text-emerald-800">{SERVICE_CATEGORIES[service.category] || service.category}</p>
      <h1 className="text-3xl font-bold text-emerald-900">{service.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">{service.description}</p>
      <dl className="mt-6 space-y-3 text-sm">
        <div><dt className="font-medium text-gray-600">Eligible customers</dt><dd>{ELIGIBLE_LABELS[service.eligibleCustomer]}</dd></div>
        {service.availability && (
          <div><dt className="font-medium text-gray-600">Availability</dt><dd>{service.availability}</dd></div>
        )}
        {service.collectionInstructions && (
          <div><dt className="font-medium text-gray-600">Collection instructions</dt><dd className="whitespace-pre-wrap">{service.collectionInstructions}</dd></div>
        )}
      </dl>
    </main>
  );
}
`);

console.log("\nSab content files ban gayin.");