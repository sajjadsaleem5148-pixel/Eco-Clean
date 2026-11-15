"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { ROLES } from "@/lib/permissions/roles";
import { ASSIGNABLE_FROM } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  collectorId: z.string().regex(/^[a-f\d]{24}$/i, "Please choose a collector"),
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

export async function assignCollectorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("reports.assign");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    collectorId: formData.get("collectorId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, collectorId, reason } = parsed.data;

  try {
    await connectDB();

    const report = await WasteReport.findOne({ reportId, deletedAt: null })
      .select("status serviceZone assignedCollector");
    if (!report || !ASSIGNABLE_FROM.includes(report.status)) {
      return { error: "This report cannot be assigned right now." };
    }

    const collector = await User.findOne({
      _id: collectorId,
      role: ROLES.COLLECTOR,
      status: "ACTIVE",
      deletedAt: null,
    }).select("serviceZone");
    if (!collector) return { error: "The selected collector is not available." };

    if (!collector.serviceZone || collector.serviceZone.toString() !== report.serviceZone.toString()) {
      return { error: "This collector is not assigned to the report's service zone." };
    }

    const isReassign = report.status === "ASSIGNED";
    if (isReassign) {
      if (report.assignedCollector && report.assignedCollector.toString() === collectorId) {
        return { error: "This collector is already assigned." };
      }
      if (!reason || reason.length < 10) {
        return { error: "A reason of at least 10 characters is required to reassign." };
      }
    }

    const note = isReassign
      ? "Reassigned to another collector: " + reason
      : "Collector assigned" + (reason ? ": " + reason : "");

    const updated = await WasteReport.findOneAndUpdate(
      { reportId, deletedAt: null, status: report.status },
      {
        $set: { status: "ASSIGNED", assignedCollector: collector._id, assignedAt: new Date() },
        $push: { statusHistory: { status: "ASSIGNED", at: new Date(), by: user.id, note } },
      },
      { returnDocument: "after" }
    ).select("reportId");

    if (!updated) {
      return { error: "This report was updated by someone else. Please reload and try again." };
    }

    await writeAudit({
      actor: user.id,
      action: isReassign ? "report.reassign" : "report.assign",
      targetType: "WasteReport",
      targetId: reportId,
      reason: isReassign ? reason : undefined,
      metadata: { collectorId },
    });
  } catch (err) {
    console.error("Assign collector failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Collector assigned." };
}
