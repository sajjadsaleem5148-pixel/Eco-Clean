"use client";

import { useActionState } from "react";
import { createCollectorAction } from "@/actions/collectors";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function CollectorForm({ zones }) {
  const [state, formAction, pending] = useActionState(createCollectorAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="serviceZone" name="serviceZone" required defaultValue="" className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Temporary password for the collector (at least 12 characters)
        </label>
        <input id="password" name="password" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      <div>
        <label htmlFor="adminPassword" className="mb-1 block text-sm font-medium">
          Your own password (to confirm this action)
        </label>
        <input id="adminPassword" name="adminPassword" type="password" required
          autoComplete="current-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Creating..." : "Create collector"}
      </button>
    </form>
  );
}
