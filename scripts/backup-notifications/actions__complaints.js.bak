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

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Please choose a valid option");
const ticketRegex = /^ECC-\d{8}-[A-F0-9]{8}$/;

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
      { returnDocument: "after" }
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
