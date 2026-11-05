"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { REVIEW_DECISIONS, REVIEW_FROM } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  decision: z.enum(REVIEW_DECISIONS, { message: "Please choose a decision" }),
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

export async function reviewReportAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("reports.verify");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, decision, reason } = parsed.data;

  if (decision === "REJECTED" && (!reason || reason.length < 10)) {
    return { error: "A rejection reason of at least 10 characters is required." };
  }

  const defaultNotes = {
    UNDER_REVIEW: "Report is being reviewed by staff",
    VERIFIED: "Report verified by staff",
  };
  const note = reason || defaultNotes[decision];

  try {
    await connectDB();
    const updated = await WasteReport.findOneAndUpdate(
      { reportId, deletedAt: null, status: { $in: REVIEW_FROM[decision] } },
      {
        $set: { status: decision },
        $push: { statusHistory: { status: decision, at: new Date(), by: user.id, note } },
      },
      { returnDocument: "after" }
    ).select("reportId status");

    if (!updated) {
      return { error: "This report cannot be moved to that status. It may have already been updated." };
    }

    await writeAudit({
      actor: user.id,
      action: "report.review." + decision.toLowerCase(),
      targetType: "WasteReport",
      targetId: updated.reportId,
      reason: decision === "REJECTED" ? reason : undefined,
      metadata: { decision },
    });
  } catch (err) {
    console.error("Review report failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Report updated." };
}
