"use client";

import { useActionState, useEffect, useRef } from "react";
import { createComplaintAction, replyComplaintAction, reopenComplaintAction } from "@/actions/complaints";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

function Feedback({ state }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
    </>
  );
}

export function ComplaintForm({ categories, zones, idempotencyKey }) {
  const [state, formAction, pending] = useActionState(createComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Complaint category</label>
        <select id="category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone (optional)</label>
        <select id="serviceZone" name="serviceZone" defaultValue="" className={field}>
          <option value="">Not sure / not applicable</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="location" className="mb-1 block text-sm font-medium">Location or address (optional)</label>
        <input id="location" name="location" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Describe the problem</label>
        <textarea id="description" name="description" rows={5} required minLength={10} maxLength={1500} className={field} />
      </div>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Photo upload is not available yet because private image storage is not configured.
      </p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Submitting..." : "Submit complaint"}
      </button>
    </form>
  );
}

export function ComplaintReplyForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(replyComplaintAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium">Add a message</label>
        <textarea id="body" name="body" rows={3} required minLength={2} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}

export function ComplaintReopenForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(reopenComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Why is the problem not solved? (at least 10 characters)
        </label>
        <textarea id="reason" name="reason" rows={3} required minLength={10} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reopening..." : "Reopen complaint"}
      </button>
    </form>
  );
}
