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

const ticketRegex = /^ECC-\d{8}-[A-F0-9]{8}$/;

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
  assigneeId: z.string().regex(/^[a-f\d]{24}$/i, "Please choose a staff member"),
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
