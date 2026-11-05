const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("NAKAAM: Yeh script project ke root folder se chalayen. Kuch nahi likha gaya.");
  process.exit(1);
}

const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/reportTransitions.js",
  "models/WasteReport.js",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("NAKAAM: Yeh files nahi mili:");
  missing.forEach((f) => console.error(" - " + f));
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Bani:", file);
}

write("actions/adminReports.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { REVIEW_DECISIONS, REVIEW_FROM } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\\d{8}-[A-F0-9]{8}$/, "Invalid report"),
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
`);

write("components/forms/ReportReviewForm.js", `
"use client";

import { useActionState } from "react";
import { reviewReportAction } from "@/actions/adminReports";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ReportReviewForm({ reportId, decisions }) {
  const [state, formAction, pending] = useActionState(reviewReportAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />

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
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Reason (required when rejecting; the resident can see it)
        </label>
        <textarea id="reason" name="reason" rows={3} maxLength={500} className={field} />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}

      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save decision"}
      </button>
    </form>
  );
}
`);

let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (khali): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});
if (failed > 0) {
  console.error("\nNAKAAM: " + failed + " file(s) theek nahi likhi gayin.");
  process.exit(1);
}
console.log("\nSAB THEEK: " + written.length + " files likhi aur check hui.");