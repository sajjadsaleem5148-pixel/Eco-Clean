const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/contactStatus.js", `
export const CONTACT_CATEGORIES = {
  GENERAL: "General question",
  SERVICES: "Services and availability",
  COLLECTION: "Collection schedule",
  REWARDS: "Green Points and rewards",
  PARTNERSHIP: "Partnership or business enquiry",
  TECHNICAL: "Website problem",
  OTHER: "Other",
};

export const CONTACT_STATUSES = ["NEW", "IN_PROGRESS", "RESPONDED", "CLOSED"];

export const CONTACT_STATUS_LABELS = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  RESPONDED: "Responded",
  CLOSED: "Closed",
};

// Naya status -> kin statuses se allowed.
export const STATUS_FROM = {
  IN_PROGRESS: ["NEW", "RESPONDED", "CLOSED"],
  CLOSED: ["NEW", "IN_PROGRESS", "RESPONDED"],
};

export const STAFF_DECISIONS = Object.keys(STATUS_FROM);

export const DECISION_LABELS = {
  IN_PROGRESS: "Mark as In Progress (or reopen)",
  CLOSED: "Close message",
};

export const REPLYABLE = ["NEW", "IN_PROGRESS", "RESPONDED"];

export function decisionsFor(status) {
  return STAFF_DECISIONS.filter((d) => STATUS_FROM[d].includes(status));
}
`);

write("models/ContactMessage.js", `
import mongoose from "mongoose";
import { CONTACT_CATEGORIES, CONTACT_STATUSES } from "@/lib/contactStatus";

const replySchema = new mongoose.Schema(
  {
    body: { type: String, required: true, maxlength: 2000 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    category: { type: String, enum: Object.keys(CONTACT_CATEGORIES), required: true, index: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: CONTACT_STATUSES, default: "NEW", index: true },
    replies: [replySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

contactSchema.index({ createdAt: -1 });

export default mongoose.models.ContactMessage || mongoose.model("ContactMessage", contactSchema);
`);

write("actions/contact.js", `
"use server";

import crypto from "node:crypto";
import { z } from "zod";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { hit, makeKey, getClientIp } from "@/lib/security/rateLimit";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(200),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150),
  category: z.enum(Object.keys(CONTACT_CATEGORIES), { message: "Please choose a category" }),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000),
});

function makeReference() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "CM-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

const SUCCESS =
  "Thank you. Your message was recorded. A staff member will review it. This confirmation is not an email.";

export async function createContactMessageAction(prevState, formData) {
  // Honeypot: insaan yeh field nahi bharta. Bot ko jhoota success dikha dete hain.
  if (String(formData.get("website") || "").length > 0) {
    return { success: SUCCESS };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const ip = await getClientIp();
    const [byIp, byEmail] = await Promise.all([
      hit(makeKey("contact-ip", ip), 5, 60 * 60),
      hit(makeKey("contact-email", d.email), 3, 60 * 60),
    ]);
    if (!byIp.ok || !byEmail.ok) {
      return { error: "Too many messages were sent recently. Please try again later." };
    }

    await connectDB();
    const created = await ContactMessage.create({ ...d, reference: makeReference() });
    return { success: SUCCESS + " Reference: " + created.reference };
  } catch (err) {
    console.error("Contact message failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }
}
`);

write("actions/adminContact.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  CONTACT_CATEGORIES,
  STAFF_DECISIONS,
  STATUS_FROM,
  REPLYABLE,
} from "@/lib/contactStatus";

const refRegex = /^CM-\\d{8}-[A-F0-9]{8}$/;

function refresh(reference) {
  revalidatePath("/admin/contact-messages");
  revalidatePath("/admin/contact-messages/" + reference);
}

const statusSchema = z.object({
  reference: z.string().regex(refRegex, "Invalid message"),
  decision: z.enum(STAFF_DECISIONS, { message: "Please choose a decision" }),
});

export async function updateContactStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    reference: formData.get("reference"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reference, decision } = parsed.data;

  try {
    await connectDB();
    const updated = await ContactMessage.findOneAndUpdate(
      { reference, deletedAt: null, status: { $in: STATUS_FROM[decision] } },
      { $set: { status: decision } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This message cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: "contact.status." + decision.toLowerCase(),
      targetType: "ContactMessage",
      targetId: reference,
    });
  } catch (err) {
    console.error("Update contact status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(reference);
  return { success: "Status updated." };
}

const categorySchema = z.object({
  reference: z.string().regex(refRegex, "Invalid message"),
  category: z.enum(Object.keys(CONTACT_CATEGORIES), { message: "Please choose a category" }),
});

export async function updateContactCategoryAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = categorySchema.safeParse({
    reference: formData.get("reference"),
    category: formData.get("category"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reference, category } = parsed.data;

  try {
    await connectDB();
    const updated = await ContactMessage.findOneAndUpdate(
      { reference, deletedAt: null },
      { $set: { category } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Message not found." };

    await writeAudit({
      actor: user.id,
      action: "contact.category",
      targetType: "ContactMessage",
      targetId: reference,
      metadata: { category },
    });
  } catch (err) {
    console.error("Update contact category failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(reference);
  return { success: "Category updated." };
}

const replySchema = z.object({
  reference: z.string().regex(refRegex, "Invalid message"),
  body: z.string().trim().min(5, "Please write a reply (at least 5 characters)").max(2000, "Reply is too long"),
});

export async function replyContactAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = replySchema.safeParse({
    reference: formData.get("reference"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reference, body } = parsed.data;

  try {
    await connectDB();
    // Reply sirf record hoti hai. Email provider configure nahi, is liye kuch bheja nahi jata.
    const updated = await ContactMessage.findOneAndUpdate(
      { reference, deletedAt: null, status: { $in: REPLYABLE } },
      {
        $push: { replies: { body, by: user.id, at: new Date() } },
        $set: { status: "RESPONDED" },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "You cannot reply to a closed message. Reopen it first." };

    await writeAudit({
      actor: user.id,
      action: "contact.reply",
      targetType: "ContactMessage",
      targetId: reference,
    });
  } catch (err) {
    console.error("Reply contact failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(reference);
  return { success: "Reply recorded. It was not emailed, because no email provider is configured." };
}
`);

write("components/forms/ContactForm.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import { createContactMessageAction } from "@/actions/contact";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ContactForm({ categories }) {
  const [state, formAction, pending] = useActionState(createContactMessageAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="c-name" className="mb-1 block text-sm font-medium">Your name</label>
        <input id="c-name" name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" className={field} />
      </div>
      <div>
        <label htmlFor="c-email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="c-email" name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor="c-cat" className="mb-1 block text-sm font-medium">Category</label>
        <select id="c-cat" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="c-subject" className="mb-1 block text-sm font-medium">Subject</label>
        <input id="c-subject" name="subject" type="text" required minLength={3} maxLength={150} className={field} />
      </div>
      <div>
        <label htmlFor="c-message" className="mb-1 block text-sm font-medium">Message</label>
        <textarea id="c-message" name="message" rows={6} required minLength={10} maxLength={2000} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
`);

write("components/forms/AdminContactForms.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  updateContactStatusAction,
  updateContactCategoryAction,
  replyContactAction,
} from "@/actions/adminContact";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

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

export function ContactStatusForm({ reference, decisions }) {
  const [state, formAction, pending] = useActionState(updateContactStatusAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cs-decision" className="mb-1 block text-sm font-medium">Status change</label>
        <select id="cs-decision" name="decision" required defaultValue="" className={field}>
          <option value="" disabled>Choose</option>
          {decisions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save status"}
      </button>
    </form>
  );
}

export function ContactCategoryForm({ reference, current, categories }) {
  const [state, formAction, pending] = useActionState(updateContactCategoryAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cc-category" className="mb-1 block text-sm font-medium">Category</label>
        <select id="cc-category" name="category" required defaultValue={current} className={field}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save category"}
      </button>
    </form>
  );
}

export function ContactReplyForm({ reference }) {
  const [state, formAction, pending] = useActionState(replyContactAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cr-body" className="mb-1 block text-sm font-medium">Reply (recorded only, it is not emailed)</label>
        <textarea id="cr-body" name="body" rows={4} required minLength={5} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Record reply"}
      </button>
    </form>
  );
}
`);

write("app/(public)/contact/page.js", `
import ContactForm from "@/components/forms/ContactForm";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";

export const metadata = { title: "Contact | ECO-CLEAN" };

export default function ContactPage() {
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Contact us</h1>
      <p className="mt-2 text-sm text-gray-700">
        Send us a message and a staff member will review it. For missed pickups or other service problems,
        please use the Complaints page so you get a ticket you can track.
      </p>
      <p className="mt-2 text-sm text-gray-700">
        Public phone numbers and addresses will appear in the footer once an administrator configures them.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <ContactForm categories={categories} />
      </div>
    </main>
  );
}
`);

write("app/admin/(panel)/contact-messages/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, CONTACT_CATEGORIES } from "@/lib/contactStatus";

export const metadata = { title: "Contact Messages | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status, q) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/contact-messages" + (qs ? "?" + qs : "");
}

export default async function AdminContactMessagesPage({ searchParams }) {
  const user = await requirePermission("complaints.resolve");
  const canSeeUser = hasPermission(user.role, "users.read");
  const sp = await searchParams;
  const status = CONTACT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toUpperCase() : "";
  const q = /^[A-Z0-9-]{1,30}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (q) filter.reference = { $regex: "^" + q };

  let messages = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select("reference name email subject category status createdAt")
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load contact messages failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Contact Messages</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <form action="/admin/contact-messages" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search reference</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={30} placeholder="CM-2026"
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Search
        </button>
      </form>

      <nav aria-label="Status filter" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null, q)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All
        </Link>
        {CONTACT_STATUSES.map((s) => (
          <Link key={s} href={href(1, s, q)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {CONTACT_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Messages could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && messages.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No messages match this filter.
        </p>
      )}

      {messages.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Reference</th>
                <th scope="col" className="py-2 pr-4">From</th>
                <th scope="col" className="py-2 pr-4">Subject</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Received</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/contact-messages/" + m.reference} className="font-semibold text-emerald-800 underline">
                      {m.reference}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{m.name}{canSeeUser ? " (" + m.email + ")" : ""}</td>
                  <td className="py-2 pr-4">{m.subject}</td>
                  <td className="py-2 pr-4">{CONTACT_CATEGORIES[m.category] || m.category}</td>
                  <td className="py-2 pr-4">{CONTACT_STATUS_LABELS[m.status] || m.status}</td>
                  <td className="py-2">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, status, q)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, status, q)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
`);

write("app/admin/(panel)/contact-messages/[reference]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import {
  CONTACT_CATEGORIES,
  CONTACT_STATUS_LABELS,
  DECISION_LABELS,
  REPLYABLE,
  decisionsFor,
} from "@/lib/contactStatus";
import {
  ContactStatusForm,
  ContactCategoryForm,
  ContactReplyForm,
} from "@/components/forms/AdminContactForms";

export const metadata = { title: "Contact Message | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminContactDetailPage({ params }) {
  const user = await requirePermission("complaints.resolve");
  const { reference } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let msg = null;
  try {
    await connectDB();
    msg = await ContactMessage.findOne({ reference, deletedAt: null })
      .populate("replies.by", "name")
      .lean();
  } catch (err) {
    console.error("Load contact message failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This message could not be loaded. Please try again later.
      </p>
    );
  }

  if (!msg) notFound();

  const decisions = decisionsFor(msg.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const canReply = REPLYABLE.includes(msg.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/contact-messages" className="text-sm font-semibold text-emerald-800 underline">Back to messages</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{msg.subject}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          {msg.reference} | Status: {CONTACT_STATUS_LABELS[msg.status] || msg.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">From</dt><dd>{msg.name}</dd></div>
          {canSeeUser && <div><dt className="font-medium text-gray-600">Email</dt><dd>{msg.email}</dd></div>}
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{CONTACT_CATEGORIES[msg.category] || msg.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Received</dt><dd>{formatDateTime(msg.createdAt)}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Message</dt><dd className="whitespace-pre-wrap">{msg.message}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Replies</h2>
        <p className="mt-1 text-xs text-gray-600">
          Replies are recorded only. No email provider is configured, so nothing is sent to the sender.
        </p>
        {msg.replies.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">No replies yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {msg.replies.map((r, i) => (
              <li key={i} className="rounded-md border border-gray-200 p-3">
                <p className="font-semibold">{r.by ? r.by.name : "Staff"}</p>
                <p className="text-gray-600">{formatDateTime(r.at)} | Not emailed</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          {canReply ? (
            <ContactReplyForm reference={msg.reference} />
          ) : (
            <p className="text-sm text-gray-700">This message is closed. Reopen it to record a reply.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No status changes are available.</p>
        ) : (
          <div className="mt-3">
            <ContactStatusForm reference={msg.reference} decisions={decisions} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Categorize</h2>
        <div className="mt-3">
          <ContactCategoryForm reference={msg.reference} current={msg.category} categories={categories} />
        </div>
      </section>
    </div>
  );
}
`);

console.log("\nSab contact files ban gayin.");