"use client";

import { useActionState } from "react";
import { createZoneAction } from "@/actions/zones";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ZoneForm() {
  const [state, formAction, pending] = useActionState(createZoneAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Zone name</label>
        <input id="name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id="description" name="description" rows={3} maxLength={500} className={field} />
      </div>
      <div>
        <label htmlFor="targetCollectionEveryDays" className="mb-1 block text-sm font-medium">
          Target: collect every N days (a service target, not a guarantee)
        </label>
        <input id="targetCollectionEveryDays" name="targetCollectionEveryDays" type="number"
          min={1} max={30} defaultValue={3} required className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Create zone"}
      </button>
    </form>
  );
}
