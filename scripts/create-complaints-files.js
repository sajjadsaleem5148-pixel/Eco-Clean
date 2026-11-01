const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/complaintStatus.js", `
export const COMPLAINT_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED", "ESCALATED",
];

export const COMPLAINT_STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  ESCALATED: "Escalated",
};

export const COMPLAINT_CATEGORIES = {
  MISSED_COLLECTION: "Missed collection",
  OVERFLOWING_BINS: "Overflowing bins",
  ILLEGAL_DUMPING: "Illegal dumping",
  DAMAGED_CONTAINER: "Damaged container",
  WORKER_MISCONDUCT: "Worker misconduct",
  INCORRECT_POINTS: "Incorrect Green Points",
  HAZARDOUS_WASTE: "Hazardous-waste concern",
  INCORRECT_SCHEDULE: "Incorrect schedule",
  SEGREGATION_DISPUTE: "Segregation dispute",
  OTHER: "Other cleanliness issue",
};

export const OPEN_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"];

// Naya status -> kin statuses se allowed.
export const STATUS_FROM = {
  UNDER_REVIEW: ["SUBMITTED", "ESCALATED"],
  IN_PROGRESS: ["ASSIGNED"],
  RESOLVED: ["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
  ESCALATED: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"],
};

export const STAFF_DECISIONS = Object.keys(STATUS_FROM);

export const DECISION_LABELS = {
  UNDER_REVIEW: "Mark as Under Review",
  IN_PROGRESS: "Mark as In Progress",
  RESOLVED: "Resolve complaint",
  REJECTED: "Reject complaint",
  ESCALATED: "Escalate complaint",
};

export const REASON_REQUIRED = ["RESOLVED", "REJECTED", "ESCALATED"];

export const ASSIGNABLE_FROM = ["SUBMITTED", "UNDER_REVIEW", "ESCALATED", "ASSIGNED", "IN_PROGRESS"];

export const COMPLAINT_STAFF_ROLES = ["SUPER_ADMIN", "COMPLAINTS_MANAGER", "SUPPORT_AGENT"];

export const REOPEN_WINDOW_DAYS = 7;
export const MAX_REOPENS = 1;

export function decisionsFor(status) {
  return STAFF_DECISIONS.filter((d) => STATUS_FROM[d].includes(status));
}
`);

write("models/Complaint.js", `
import mongoose from "mongoose";
import { COMPLAINT_STATUSES, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: COMPLAINT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const complaintSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: Object.keys(COMPLAINT_CATEGORIES), required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 1500 },
    location: { type: String, trim: true, maxlength: 300 },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone" },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    status: { type: String, enum: COMPLAINT_STATUSES, default: "SUBMITTED", index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    resolutionSummary: { type: String, maxlength: 500 },
    resolvedAt: { type: Date },
    reopenCount: { type: Number, default: 0 },
    idempotencyKey: { type: String },
    statusHistory: [historySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

complaintSchema.index(
  { reporter: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
complaintSchema.index({ createdAt: -1 });

export default mongoose.models.Complaint || mongoose.model("Complaint", complaintSchema);
`);

write("models/ComplaintMessage.js", `
import mongoose from "mongoose";

const complaintMessageSchema = new mongoose.Schema(
  {
    complaint: { type: mongoose.Schema.Types.ObjectId, ref: "Complaint", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, required: true },
    // INTERNAL messages residents ko kabhi nahi dikhte.
    visibility: { type: String, enum: ["PUBLIC", "INTERNAL"], default: "PUBLIC", index: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.models.ComplaintMessage || mongoose.model("ComplaintMessage", complaintMessageSchema);
`);

write("actions/complaints.js", `
"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import { hit, makeKey } from "@/lib/security/rateLimit";
import { writeAudit } from "@/lib/audit/log";
import {
  COMPLAINT_CATEGORIES,
  OPEN_STATUSES,
  REOPEN_WINDOW_DAYS,
  MAX_REOPENS,
} from "@/lib/complaintStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a valid option");
const ticketRegex = /^ECC-\\d{8}-[A-F0-9]{8}$/;

const createSchema = z.object({
  category: z.enum(Object.keys(COMPLAINT_CATEGORIES), { message: "Please choose a category" }),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1500),
  location: z.string().trim().max(300).optional(),
  serviceZone: objectId.optional(),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid form. Please reload the page."),
});

function makeTicket() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "ECC-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function createComplaintAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "Please log in with a resident account to submit a complaint." };
  }

  const parsed = createSchema.safeParse({
    category: formData.get("category"),
    description: formData.get("description"),
    location: formData.get("location") || undefined,
    serviceZone: formData.get("serviceZone") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  let ticket = null;
  try {
    await connectDB();

    const existing = await Complaint.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
      .select("ticketNumber").lean();
    if (existing) {
      ticket = existing.ticketNumber;
    } else {
      const rl = await hit(makeKey("complaint-create", user.id), 5, 60 * 60);
      if (!rl.ok) {
        return { error: "You have submitted too many complaints in the last hour. Please try again later." };
      }

      let zoneId;
      if (d.serviceZone) {
        const zone = await ServiceZone.findOne({ _id: d.serviceZone, status: "ACTIVE", deletedAt: null }).select("_id").lean();
        if (!zone) return { error: "The selected zone is not available." };
        zoneId = zone._id;
      }

      const priority = d.category === "HAZARDOUS_WASTE" ? "HIGH" : "NORMAL";

      try {
        const created = await Complaint.create({
          ticketNumber: makeTicket(),
          reporter: user.id,
          category: d.category,
          description: d.description,
          location: d.location,
          serviceZone: zoneId,
          priority,
          idempotencyKey: d.idempotencyKey,
          statusHistory: [{ status: "SUBMITTED", by: user.id, note: "Complaint submitted by resident" }],
        });
        ticket = created.ticketNumber;
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey) {
          const again = await Complaint.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
            .select("ticketNumber").lean();
          if (again) ticket = again.ticketNumber;
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Create complaint failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  if (!ticket) return { error: "Something went wrong. Please try again." };
  redirect("/dashboard/complaints/" + ticket);
}

const replySchema = z.object({
  ticketNumber: z.string().regex(ticketRegex, "Invalid complaint"),
  body: z.string().trim().min(2, "Please write a message").max(2000, "Message is too long"),
});

export async function replyComplaintAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") return { error: "You do not have permission to do this." };

  const parsed = replySchema.safeParse({
    ticketNumber: formData.get("ticketNumber"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticketNumber, body } = parsed.data;

  try {
    await connectDB();
    // Sirf apni aur sirf open complaint.
    const complaint = await Complaint.findOne({
      ticketNumber,
      reporter: user.id,
      deletedAt: null,
      status: { $in: OPEN_STATUSES },
    }).select("_id").lean();
    if (!complaint) return { error: "You can only reply to your own open complaints." };

    const rl = await hit(makeKey("complaint-reply", user.id), 20, 60 * 60);
    if (!rl.ok) return { error: "Too many messages. Please try again later." };

    await ComplaintMessage.create({
      complaint: complaint._id,
      author: user.id,
      authorRole: "RESIDENT",
      visibility: "PUBLIC",
      body,
    });
  } catch (err) {
    console.error("Reply complaint failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/complaints/" + ticketNumber);
  revalidatePath("/admin/complaints/" + ticketNumber);
  return { success: "Message sent." };
}

const reopenSchema = z.object({
  ticketNumber: z.string().regex(ticketRegex, "Invalid complaint"),
  reason: z.string().trim().min(10, "Please explain why you are reopening (at least 10 characters)").max(500),
});

export async function reopenComplaintAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") return { error: "You do not have permission to do this." };

  const parsed = reopenSchema.safeParse({
    ticketNumber: formData.get("ticketNumber"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticketNumber, reason } = parsed.data;

  try {
    await connectDB();
    const cutoff = new Date(Date.now() - REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Policy: sirf apni, sirf Resolved, 7 din ke andar, aur sirf ek baar.
    const updated = await Complaint.findOneAndUpdate(
      {
        ticketNumber,
        reporter: user.id,
        deletedAt: null,
        status: "RESOLVED",
        reopenCount: { $lt: MAX_REOPENS },
        resolvedAt: { $gte: cutoff },
      },
      {
        $set: { status: "UNDER_REVIEW" },
        $inc: { reopenCount: 1 },
        $push: { statusHistory: { status: "UNDER_REVIEW", at: new Date(), by: user.id, note: "Reopened by resident" } },
      },
      { new: true }
    ).select("_id");

    if (!updated) {
      return {
        error:
          "This complaint cannot be reopened. It can be reopened once, within " +
          REOPEN_WINDOW_DAYS + " days of being resolved.",
      };
    }

    await ComplaintMessage.create({
      complaint: updated._id,
      author: user.id,
      authorRole: "RESIDENT",
      visibility: "PUBLIC",
      body: "Reopened: " + reason,
    });
    await writeAudit({
      actor: user.id,
      action: "complaint.reopen",
      targetType: "Complaint",
      targetId: ticketNumber,
      reason,
    });
  } catch (err) {
    console.error("Reopen complaint failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/complaints/" + ticketNumber);
  revalidatePath("/admin/complaints/" + ticketNumber);
  return { success: "Complaint reopened." };
}
`);

write("actions/adminComplaints.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  STAFF_DECISIONS,
  STATUS_FROM,
  REASON_REQUIRED,
  ASSIGNABLE_FROM,
  COMPLAINT_STAFF_ROLES,
} from "@/lib/complaintStatus";

const ticketRegex = /^ECC-\\d{8}-[A-F0-9]{8}$/;

function refresh(ticketNumber) {
  revalidatePath("/admin/complaints");
  revalidatePath("/admin/complaints/" + ticketNumber);
  revalidatePath("/dashboard/complaints/" + ticketNumber);
}

const statusSchema = z.object({
  ticketNumber: z.string().regex(ticketRegex, "Invalid complaint"),
  decision: z.enum(STAFF_DECISIONS, { message: "Please choose a decision" }),
  reason: z.string().trim().max(500, "Text is too long (500 characters maximum)").optional(),
});

const DEFAULT_NOTES = {
  UNDER_REVIEW: "Complaint is being reviewed",
  IN_PROGRESS: "Work on the complaint has started",
};

export async function updateComplaintStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    ticketNumber: formData.get("ticketNumber"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticketNumber, decision, reason } = parsed.data;

  if (REASON_REQUIRED.includes(decision) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required for this decision." };
  }

  const set = { status: decision };
  let note;
  if (decision === "ESCALATED") {
    // Wajah internal note mein jati hai, resident ko sirf generic line nazar aati hai.
    note = "Escalated for senior review";
  } else if (decision === "RESOLVED") {
    note = "Complaint resolved";
    set.resolutionSummary = reason;
    set.resolvedAt = new Date();
  } else if (decision === "REJECTED") {
    note = reason;
  } else {
    note = reason || DEFAULT_NOTES[decision];
  }

  try {
    await connectDB();
    const updated = await Complaint.findOneAndUpdate(
      { ticketNumber, deletedAt: null, status: { $in: STATUS_FROM[decision] } },
      {
        $set: set,
        $push: { statusHistory: { status: decision, at: new Date(), by: user.id, note } },
      },
      { new: true }
    ).select("_id ticketNumber");

    if (!updated) {
      return { error: "This complaint cannot be moved to that status. It may have already been updated." };
    }

    if (decision === "ESCALATED") {
      await ComplaintMessage.create({
        complaint: updated._id,
        author: user.id,
        authorRole: user.role,
        visibility: "INTERNAL",
        body: "Escalation reason: " + reason,
      });
    }

    await writeAudit({
      actor: user.id,
      action: "complaint.status." + decision.toLowerCase(),
      targetType: "Complaint",
      targetId: ticketNumber,
      reason: REASON_REQUIRED.includes(decision) ? reason : undefined,
      metadata: { decision },
    });
  } catch (err) {
    console.error("Update complaint status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(ticketNumber);
  return { success: "Complaint updated." };
}

const assignSchema = z.object({
  ticketNumber: z.string().regex(ticketRegex, "Invalid complaint"),
  assigneeId: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a staff member"),
  reason: z.string().trim().max(500, "Text is too long (500 characters maximum)").optional(),
});

export async function assignComplaintAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = assignSchema.safeParse({
    ticketNumber: formData.get("ticketNumber"),
    assigneeId: formData.get("assigneeId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticketNumber, assigneeId, reason } = parsed.data;

  try {
    await connectDB();

    const complaint = await Complaint.findOne({ ticketNumber, deletedAt: null }).select("status assignedTo");
    if (!complaint || !ASSIGNABLE_FROM.includes(complaint.status)) {
      return { error: "This complaint cannot be assigned right now." };
    }

    const assignee = await User.findOne({
      _id: assigneeId,
      role: { $in: COMPLAINT_STAFF_ROLES },
      status: "ACTIVE",
      deletedAt: null,
    }).select("_id");
    if (!assignee) return { error: "The selected staff member is not available." };

    const isReassign = Boolean(complaint.assignedTo);
    if (isReassign) {
      if (complaint.assignedTo.toString() === assigneeId) {
        return { error: "This staff member is already assigned." };
      }
      if (!reason || reason.length < 10) {
        return { error: "A reason of at least 10 characters is required to reassign." };
      }
    }

    const newStatus = ["SUBMITTED", "UNDER_REVIEW", "ESCALATED"].includes(complaint.status)
      ? "ASSIGNED"
      : complaint.status;

    // Pichla status aur pichla assignee bhi filter mein hain, taake do staff ek saath badlen to ek hi kamyab ho.
    const updated = await Complaint.findOneAndUpdate(
      {
        ticketNumber,
        deletedAt: null,
        status: complaint.status,
        assignedTo: complaint.assignedTo || null,
      },
      {
        $set: { status: newStatus, assignedTo: assignee._id },
        $push: {
          statusHistory: {
            status: newStatus,
            at: new Date(),
            by: user.id,
            note: isReassign ? "Reassigned to another staff member" : "Assigned to a staff member",
          },
        },
      },
      { new: true }
    ).select("_id");

    if (!updated) {
      return { error: "This complaint was updated by someone else. Please reload and try again." };
    }

    if (isReassign) {
      await ComplaintMessage.create({
        complaint: updated._id,
        author: user.id,
        authorRole: user.role,
        visibility: "INTERNAL",
        body: "Reassignment reason: " + reason,
      });
    }

    await writeAudit({
      actor: user.id,
      action: isReassign ? "complaint.reassign" : "complaint.assign",
      targetType: "Complaint",
      targetId: ticketNumber,
      reason: isReassign ? reason : undefined,
      metadata: { assigneeId },
    });
  } catch (err) {
    console.error("Assign complaint failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(ticketNumber);
  return { success: "Complaint assigned." };
}

const messageSchema = z.object({
  ticketNumber: z.string().regex(ticketRegex, "Invalid complaint"),
  visibility: z.enum(["PUBLIC", "INTERNAL"], { message: "Please choose who can see this message" }),
  body: z.string().trim().min(2, "Please write a message").max(2000, "Message is too long"),
});

export async function staffMessageAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("complaints.resolve");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = messageSchema.safeParse({
    ticketNumber: formData.get("ticketNumber"),
    visibility: formData.get("visibility"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { ticketNumber, visibility, body } = parsed.data;

  try {
    await connectDB();
    const complaint = await Complaint.findOne({ ticketNumber, deletedAt: null }).select("_id").lean();
    if (!complaint) return { error: "Complaint not found." };

    await ComplaintMessage.create({
      complaint: complaint._id,
      author: user.id,
      authorRole: user.role,
      visibility,
      body,
    });
  } catch (err) {
    console.error("Staff message failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh(ticketNumber);
  return { success: visibility === "PUBLIC" ? "Reply sent to the resident." : "Internal note saved." };
}
`);

write("components/forms/ComplaintForms.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import { createComplaintAction, replyComplaintAction, reopenComplaintAction } from "@/actions/complaints";

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

export function ComplaintForm({ categories, zones, idempotencyKey }) {
  const [state, formAction, pending] = useActionState(createComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Complaint category</label>
        <select id="category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone (optional)</label>
        <select id="serviceZone" name="serviceZone" defaultValue="" className={field}>
          <option value="">Not sure / not applicable</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="location" className="mb-1 block text-sm font-medium">Location or address (optional)</label>
        <input id="location" name="location" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Describe the problem</label>
        <textarea id="description" name="description" rows={5} required minLength={10} maxLength={1500} className={field} />
      </div>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Photo upload is not available yet because private image storage is not configured.
      </p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Submitting..." : "Submit complaint"}
      </button>
    </form>
  );
}

export function ComplaintReplyForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(replyComplaintAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium">Add a message</label>
        <textarea id="body" name="body" rows={3} required minLength={2} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}

export function ComplaintReopenForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(reopenComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Why is the problem not solved? (at least 10 characters)
        </label>
        <textarea id="reason" name="reason" rows={3} required minLength={10} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reopening..." : "Reopen complaint"}
      </button>
    </form>
  );
}
`);

write("components/forms/AdminComplaintForms.js", `
"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  updateComplaintStatusAction,
  assignComplaintAction,
  staffMessageAction,
} from "@/actions/adminComplaints";

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

export function ComplaintStatusForm({ ticketNumber, decisions }) {
  const [state, formAction, pending] = useActionState(updateComplaintStatusAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="decision" className="mb-1 block text-sm font-medium">Decision</label>
        <select id="decision" name="decision" required defaultValue="" className={field}>
          <option value="" disabled>Choose a decision</option>
          {decisions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="status-reason" className="mb-1 block text-sm font-medium">
          Reason or resolution summary (required to resolve, reject or escalate; resolve and reject texts are visible to the resident, escalation reasons stay internal)
        </label>
        <textarea id="status-reason" name="reason" rows={3} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save decision"}
      </button>
    </form>
  );
}

export function ComplaintAssignForm({ ticketNumber, staff, isReassign }) {
  const [state, formAction, pending] = useActionState(assignComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="assigneeId" className="mb-1 block text-sm font-medium">Staff member</label>
        <select id="assigneeId" name="assigneeId" required defaultValue="" className={field}>
          <option value="" disabled>Choose staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-reason" className="mb-1 block text-sm font-medium">
          {isReassign ? "Reason for reassigning (required, internal)" : "Note (optional)"}
        </label>
        <textarea id="assign-reason" name="reason" rows={2} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : isReassign ? "Reassign" : "Assign"}
      </button>
    </form>
  );
}

export function StaffMessageForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(staffMessageAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="visibility" className="mb-1 block text-sm font-medium">Who can see this?</label>
        <select id="visibility" name="visibility" required defaultValue="" className={field}>
          <option value="" disabled>Choose</option>
          <option value="PUBLIC">Public reply (resident can see)</option>
          <option value="INTERNAL">Internal note (staff only)</option>
        </select>
      </div>
      <div>
        <label htmlFor="staff-body" className="mb-1 block text-sm font-medium">Message</label>
        <textarea id="staff-body" name="body" rows={3} required minLength={2} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save message"}
      </button>
    </form>
  );
}
`);

write("app/(public)/complaints/page.js", `
import crypto from "node:crypto";
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import { COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";
import { ComplaintForm } from "@/components/forms/ComplaintForms";

export const metadata = { title: "Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  let user = null;
  let zones = [];
  let loadError = false;

  try {
    user = await getCurrentUser();
    if (user && user.role === "RESIDENT") {
      await connectDB();
      const z = await ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean();
      zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    }
  } catch (err) {
    console.error("Complaints page load failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(COMPLAINT_CATEGORIES).map(([value, label]) => ({ value, label }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Complaints</h1>
      <p className="mt-2 text-sm text-gray-700">
        Tell us about missed collections, damaged containers, incorrect points or other problems.
        You will get a ticket number and can follow the status in your account.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This page is temporarily unavailable. Please try again later.
        </p>
      )}

      {!loadError && !user && (
        <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Please <Link href="/login" className="font-semibold text-emerald-800 underline">log in</Link> or{" "}
          <Link href="/register" className="font-semibold text-emerald-800 underline">register</Link> to submit a complaint.
        </div>
      )}

      {!loadError && user && user.role !== "RESIDENT" && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Only resident accounts can submit complaints.
        </p>
      )}

      {!loadError && user && user.role === "RESIDENT" && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <ComplaintForm categories={categories} zones={zones} idempotencyKey={crypto.randomUUID()} />
          <p className="mt-4 text-sm">
            <Link href="/dashboard/complaints" className="font-semibold text-emerald-800 underline">
              View my complaints
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
`);

write("app/dashboard/complaints/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";

export const metadata = { title: "My Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyComplaintsPage() {
  const user = await requireRole(["RESIDENT"]);

  let complaints = [];
  let loadError = false;
  try {
    await connectDB();
    // Hamesha apni complaints: reporter server ke session se aata hai.
    complaints = await Complaint.find({ reporter: user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("ticketNumber category status createdAt")
      .lean();
  } catch (err) {
    console.error("Load complaints failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">My Complaints</h1>
        <Link href="/complaints" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          New complaint
        </Link>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Complaints could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && complaints.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          You have not submitted any complaints yet.
        </p>
      )}

      {complaints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Ticket</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/dashboard/complaints/" + c.ticketNumber} className="font-semibold text-emerald-800 underline">
                      {c.ticketNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{COMPLAINT_CATEGORIES[c.category] || c.category}</td>
                  <td className="py-2 pr-4">{COMPLAINT_STATUS_LABELS[c.status] || c.status}</td>
                  <td className="py-2">{formatDateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
`);

write("app/dashboard/complaints/[id]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  OPEN_STATUSES,
  REOPEN_WINDOW_DAYS,
  MAX_REOPENS,
} from "@/lib/complaintStatus";
import { ComplaintReplyForm, ComplaintReopenForm } from "@/components/forms/ComplaintForms";

export const metadata = { title: "Complaint Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({ params }) {
  const user = await requireRole(["RESIDENT"]);
  const { id } = await params;

  let complaint = null;
  let messages = [];
  try {
    await connectDB();
    // reporter ka filter zaroori hai. assignedTo select hi nahi hota.
    complaint = await Complaint.findOne({ ticketNumber: id, reporter: user.id, deletedAt: null })
      .populate("serviceZone", "name")
      .select("ticketNumber category description location serviceZone status statusHistory resolutionSummary resolvedAt reopenCount createdAt")
      .lean();

    if (complaint) {
      // Sirf PUBLIC messages. INTERNAL kabhi query mein nahi aate.
      messages = await ComplaintMessage.find({ complaint: complaint._id, visibility: "PUBLIC" })
        .sort({ createdAt: 1 })
        .select("authorRole body createdAt")
        .lean();
    }
  } catch (err) {
    console.error("Load complaint failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This complaint could not be loaded. Please try again later.
      </p>
    );
  }

  if (!complaint) notFound();

  const isOpen = OPEN_STATUSES.includes(complaint.status);
  const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const canReopen =
    complaint.status === "RESOLVED" &&
    complaint.reopenCount < MAX_REOPENS &&
    complaint.resolvedAt &&
    Date.now() - new Date(complaint.resolvedAt).getTime() <= windowMs;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/dashboard/complaints" className="text-sm font-semibold text-emerald-800 underline">
          Back to my complaints
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Complaint {complaint.ticketNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {COMPLAINT_STATUS_LABELS[complaint.status] || complaint.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{COMPLAINT_CATEGORIES[complaint.category] || complaint.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{complaint.serviceZone ? complaint.serviceZone.name : "-"}</dd></div>
          {complaint.location && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Location</dt><dd>{complaint.location}</dd></div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{complaint.description}</dd></div>
        </dl>
        {complaint.resolutionSummary && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Resolution</p>
            <p>{complaint.resolutionSummary}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {messages.map((m) => (
              <li key={m._id.toString()} className="rounded-md border border-gray-200 p-3">
                <p className="font-semibold">{m.authorRole === "RESIDENT" ? "You" : "ECO-CLEAN staff"}</p>
                <p className="text-gray-600">{formatDateTime(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        {isOpen && (
          <div className="mt-4">
            <ComplaintReplyForm ticketNumber={complaint.ticketNumber} />
          </div>
        )}
      </section>

      {canReopen && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Not solved?</h2>
          <p className="mt-1 text-sm text-gray-700">
            You can reopen a resolved complaint once, within {REOPEN_WINDOW_DAYS} days.
          </p>
          <div className="mt-3">
            <ComplaintReopenForm ticketNumber={complaint.ticketNumber} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {complaint.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{COMPLAINT_STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/complaints/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { COMPLAINT_STATUSES, COMPLAINT_STATUS_LABELS, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";

export const metadata = { title: "Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status, q) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/complaints" + (qs ? "?" + qs : "");
}

export default async function AdminComplaintsPage({ searchParams }) {
  await requirePermission("complaints.resolve");
  const sp = await searchParams;
  const status = COMPLAINT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toUpperCase() : "";
  // Sirf letters, numbers aur hyphen allowed, isliye regex mein koi special character nahi ja sakta.
  const q = /^[A-Z0-9-]{1,30}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (q) filter.ticketNumber = { $regex: "^" + q };

  let complaints = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("assignedTo", "name")
        .select("ticketNumber category priority status assignedTo createdAt")
        .lean(),
      Complaint.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load admin complaints failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <form action="/admin/complaints" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search ticket number</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={30} placeholder="ECC-2026"
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
        {COMPLAINT_STATUSES.map((s) => (
          <Link key={s} href={href(1, s, q)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {COMPLAINT_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Complaints could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && complaints.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No complaints match this filter.
        </p>
      )}

      {complaints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Ticket</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Priority</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Assigned to</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/complaints/" + c.ticketNumber} className="font-semibold text-emerald-800 underline">
                      {c.ticketNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{COMPLAINT_CATEGORIES[c.category] || c.category}</td>
                  <td className="py-2 pr-4">{c.priority}</td>
                  <td className="py-2 pr-4">{COMPLAINT_STATUS_LABELS[c.status] || c.status}</td>
                  <td className="py-2 pr-4">{c.assignedTo ? c.assignedTo.name : "Unassigned"}</td>
                  <td className="py-2">{formatDateTime(c.createdAt)}</td>
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

write("app/admin/(panel)/complaints/[ticket]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import User from "@/models/User";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  DECISION_LABELS,
  ASSIGNABLE_FROM,
  COMPLAINT_STAFF_ROLES,
  decisionsFor,
} from "@/lib/complaintStatus";
import {
  ComplaintStatusForm,
  ComplaintAssignForm,
  StaffMessageForm,
} from "@/components/forms/AdminComplaintForms";

export const metadata = { title: "Complaint Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminComplaintDetailPage({ params }) {
  const user = await requirePermission("complaints.resolve");
  const { ticket } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let complaint = null;
  let messages = [];
  let staff = [];
  try {
    await connectDB();
    complaint = await Complaint.findOne({ ticketNumber: ticket, deletedAt: null })
      .populate("serviceZone", "name")
      .populate("reporter", "name email")
      .populate("assignedTo", "name")
      .lean();

    if (complaint) {
      messages = await ComplaintMessage.find({ complaint: complaint._id })
        .sort({ createdAt: 1 })
        .populate("author", "name")
        .lean();

      if (ASSIGNABLE_FROM.includes(complaint.status)) {
        const list = await User.find({
          role: { $in: COMPLAINT_STAFF_ROLES },
          status: "ACTIVE",
          deletedAt: null,
        }).sort({ name: 1 }).select("name role").lean();
        staff = list.map((s) => ({ id: s._id.toString(), name: s.name, role: s.role }));
      }
    }
  } catch (err) {
    console.error("Load admin complaint failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This complaint could not be loaded. Please try again later.
      </p>
    );
  }

  if (!complaint) notFound();

  const decisions = decisionsFor(complaint.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  const assignable = ASSIGNABLE_FROM.includes(complaint.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/complaints" className="text-sm font-semibold text-emerald-800 underline">Back to complaints</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Complaint {complaint.ticketNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {COMPLAINT_STATUS_LABELS[complaint.status] || complaint.status} | Priority: {complaint.priority}
        </p>
        <p className="mt-1 text-sm text-gray-700">
          Assigned to: {complaint.assignedTo ? complaint.assignedTo.name : "Unassigned"}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{COMPLAINT_CATEGORIES[complaint.category] || complaint.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{complaint.serviceZone ? complaint.serviceZone.name : "-"}</dd></div>
          {canSeeUser && complaint.reporter && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-gray-600">Reporter</dt>
              <dd>{complaint.reporter.name} ({complaint.reporter.email})</dd>
            </div>
          )}
          {complaint.location && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Location</dt><dd>{complaint.location}</dd></div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{complaint.description}</dd></div>
          {complaint.resolutionSummary && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Resolution summary</dt><dd>{complaint.resolutionSummary}</dd></div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Decision</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No status changes are available for this complaint.</p>
        ) : (
          <div className="mt-3">
            <ComplaintStatusForm ticketNumber={complaint.ticketNumber} decisions={decisions} />
          </div>
        )}
      </section>

      {assignable && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{complaint.assignedTo ? "Reassign" : "Assign"}</h2>
          {staff.length === 0 ? (
            <p className="mt-2 text-sm text-gray-700">No staff members are available to assign.</p>
          ) : (
            <div className="mt-3">
              <ComplaintAssignForm
                ticketNumber={complaint.ticketNumber}
                staff={staff}
                isReassign={Boolean(complaint.assignedTo)}
              />
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {messages.map((m) => (
              <li
                key={m._id.toString()}
                className={"rounded-md border p-3 " + (m.visibility === "INTERNAL" ? "border-amber-300 bg-amber-50" : "border-gray-200")}
              >
                <p className="font-semibold">
                  {m.author ? m.author.name : "Unknown"} ({m.authorRole}){" "}
                  <span className="text-xs font-medium">
                    [{m.visibility === "INTERNAL" ? "Internal note" : "Public"}]
                  </span>
                </p>
                <p className="text-gray-600">{formatDateTime(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <StaffMessageForm ticketNumber={complaint.ticketNumber} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {complaint.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{COMPLAINT_STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
`);

console.log("\nSab complaints files ban gayin.");