"use client";

import { useActionState } from "react";
import { saveZoneAction } from "@/actions/household";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function HouseholdForm({ zones, currentId }) {
  const [state, formAction, pending] = useActionState(saveZoneAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="hh-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="hh-zone" name="zoneId" required defaultValue={currentId || ""} className={field}>
          <option value="" disabled>Select your zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save zone"}
      </button>
    </form>
  );
}
