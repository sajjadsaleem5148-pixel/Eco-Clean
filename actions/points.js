"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteCategory from "@/models/WasteCategory";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { verifyCurrentPassword } from "@/lib/security/stepUp";
import { awardReportPoints, adjustPoints, reverseTransaction, describePointsError } from "@/services/points";
import { MAX_POINTS_PER_ENTRY } from "@/lib/points/labels";

function refresh() {
  revalidatePath("/admin/green-points");
  revalidatePath("/admin/points-rules");
  revalidatePath("/dashboard/green-points");
}

function stepUpError(check) {
  return check.reason === "LIMITED"
    ? "Too many attempts. Please try again in 15 minutes."
    : "Your password is incorrect.";
}

const awardSchema = z.object({
  reportId: z.string().regex(/^ECR-\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  reason: z.string().trim().min(10, "Please write a verification note (at least 10 characters)").max(300),
  confirm: z.literal("on", { message: "Please confirm that the collection and segregation were verified" }),
});

export async function awardReportPointsAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = awardSchema.safeParse({
    reportId: formData.get("reportId"),
    reason: formData.get("reason"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, reason } = parsed.data;

  try {
    const result = await awardReportPoints({ reportId, adminId: user.id, reason });
    await writeAudit({
      actor: user.id,
      action: "points.award",
      targetType: "WasteReport",
      targetId: reportId,
      reason,
      metadata: { transactionId: result.transactionId, points: result.points },
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Award points failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Points awarded." };
}

const adjustSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter the resident's email"),
  points: z.coerce
    .number()
    .int("Use a whole number")
    .refine((n) => n !== 0, { message: "Points cannot be zero" })
    .refine((n) => Math.abs(n) <= MAX_POINTS_PER_ENTRY, {
      message: "Maximum is " + MAX_POINTS_PER_ENTRY + " points per entry",
    }),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
  adminPassword: z.string().min(1, "Please enter your own password to confirm").max(200),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Please wait a moment and try again"),
});

export async function adjustPointsAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = adjustSchema.safeParse({
    email: formData.get("email"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(user.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    const result = await adjustPoints({
      email: d.email,
      points: d.points,
      reason: d.reason,
      adminId: user.id,
      idempotencyKey: d.idempotencyKey,
    });
    await writeAudit({
      actor: user.id,
      action: "points.adjust",
      targetType: "GreenPointsTransaction",
      targetId: result.transactionId,
      reason: d.reason,
      metadata: { points: d.points },
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Adjust points failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Adjustment recorded." };
}

const reverseSchema = z.object({
  transactionId: z.string().regex(/^GPT-\d{8}-[A-F0-9]{8}$/, "Invalid transaction"),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
  adminPassword: z.string().min(1, "Please enter your own password to confirm").max(200),
});

export async function reverseTransactionAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = reverseSchema.safeParse({
    transactionId: formData.get("transactionId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(user.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await reverseTransaction({ transactionId: d.transactionId, adminId: user.id, reason: d.reason });
    await writeAudit({
      actor: user.id,
      action: "points.reverse",
      targetType: "GreenPointsTransaction",
      targetId: d.transactionId,
      reason: d.reason,
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Reverse transaction failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Transaction reversed." };
}

const ruleSchema = z.object({
  category: z.string().regex(/^[a-f\d]{24}$/i, "Please choose a category"),
  points: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Minimum is 1 point")
    .max(MAX_POINTS_PER_ENTRY, "Maximum is " + MAX_POINTS_PER_ENTRY + " points"),
});

export async function saveRuleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = ruleSchema.safeParse({
    category: formData.get("category"),
    points: formData.get("points"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const active = formData.get("active") === "on";

  try {
    await connectDB();
    const category = await WasteCategory.findById(parsed.data.category).select("_id").lean();
    if (!category) return { error: "The selected category is not available." };

    await PointsEarningRule.findOneAndUpdate(
      { category: category._id },
      { $set: { points: parsed.data.points, active, updatedBy: user.id } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    await writeAudit({
      actor: user.id,
      action: "points.rule.save",
      targetType: "PointsEarningRule",
      targetId: parsed.data.category,
      metadata: { points: parsed.data.points, active },
    });
  } catch (err) {
    console.error("Save rule failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Rule saved." };
}
