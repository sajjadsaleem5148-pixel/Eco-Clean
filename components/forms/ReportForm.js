"use client";

import { useActionState } from "react";
import { createReportAction } from "@/actions/reports";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ReportForm({ categories, zones, idempotencyKey }) {
  const [state, formAction, pending] = useActionState(createReportAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Waste category</label>
        <select id="category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="serviceZone" name="serviceZone" required defaultValue="" className={field}>
          <option value="" disabled>Select your zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-medium">Pickup address or landmark</label>
        <input id="address" name="address" type="text" required minLength={5} maxLength={300} className={field} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="description" name="description" rows={4} required minLength={10} maxLength={1000} className={field} />
      </div>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Photo upload is not available yet because private image storage is not configured.
        You can still submit this report without a photo.
      </p>

      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Submitting..." : "Submit report"}
      </button>
    </form>
  );
}
