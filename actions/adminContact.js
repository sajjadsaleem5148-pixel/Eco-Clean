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

const refRegex = /^CM-\d{8}-[A-F0-9]{8}$/;

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
