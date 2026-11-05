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
