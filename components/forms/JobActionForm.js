"use client";

import { useActionState } from "react";
import { updateJobAction } from "@/actions/collectorJobs";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function JobActionForm({ reportId, steps }) {
  const [state, formAction, pending] = useActionState(updateJobAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />
      <div>
        <label htmlFor="step" className="mb-1 block text-sm font-medium">Action</label>
        <select id="step" name="step" required defaultValue="" className={field}>
          <option value="" disabled>Choose an action</option>
          {steps.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">
          Note (required for Collected and Unable to Collect, at least 10 characters)
        </label>
        <textarea id="note" name="note" rows={3} maxLength={500} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
