"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { COLLECTOR_STEPS, COLLECTOR_FROM, NOTE_REQUIRED } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\d{8}-[A-F0-9]{8}$/, "Invalid job"),
  step: z.enum(COLLECTOR_STEPS, { message: "Please choose an action" }),
  note: z.string().trim().max(500, "Note is too long").optional(),
});

export async function updateJobAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COLLECTOR") {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    step: formData.get("step"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, step, note } = parsed.data;

  if (NOTE_REQUIRED.includes(step) && (!note || note.length < 10)) {
    return { error: "A note of at least 10 characters is required for this action." };
  }

  const defaults = {
    ACCEPTED: "Collector accepted the job",
    ON_THE_WAY: "Collector is on the way",
    ARRIVED: "Collector arrived at the location",
  };

  try {
    await connectDB();
    // Sirf apni job, aur sirf allowed status se. Warna kuch nahi badlega.
    const updated = await WasteReport.findOneAndUpdate(
      {
        reportId,
        deletedAt: null,
        assignedCollector: user.id,
        status: { $in: COLLECTOR_FROM[step] },
      },
      {
        $set: { status: step },
        $push: {
          statusHistory: { status: step, at: new Date(), by: user.id, note: note || defaults[step] },
        },
      },
      { returnDocument: "after" }
    ).select("reportId");

    if (!updated) {
      return { error: "This job cannot be moved to that status. It may have already been updated." };
    }

    await writeAudit({
      actor: user.id,
      action: "job." + step.toLowerCase(),
      targetType: "WasteReport",
      targetId: reportId,
      reason: NOTE_REQUIRED.includes(step) ? note : undefined,
    });
  } catch (err) {
    console.error("Update job failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/collector/jobs");
  revalidatePath("/collector/jobs/" + reportId);
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Job updated." };
}
