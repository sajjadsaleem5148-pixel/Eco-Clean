"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  updateComplaintStatusAction,
  assignComplaintAction,
  staffMessageAction,
} from "@/actions/adminComplaints";

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

export function ComplaintStatusForm({ ticketNumber, decisions }) {
  const [state, formAction, pending] = useActionState(updateComplaintStatusAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
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
        <label htmlFor="status-reason" className="mb-1 block text-sm font-medium">
          Reason or resolution summary (required to resolve, reject or escalate; resolve and reject texts are visible to the resident, escalation reasons stay internal)
        </label>
        <textarea id="status-reason" name="reason" rows={3} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save decision"}
      </button>
    </form>
  );
}

export function ComplaintAssignForm({ ticketNumber, staff, isReassign }) {
  const [state, formAction, pending] = useActionState(assignComplaintAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="assigneeId" className="mb-1 block text-sm font-medium">Staff member</label>
        <select id="assigneeId" name="assigneeId" required defaultValue="" className={field}>
          <option value="" disabled>Choose staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assign-reason" className="mb-1 block text-sm font-medium">
          {isReassign ? "Reason for reassigning (required, internal)" : "Note (optional)"}
        </label>
        <textarea id="assign-reason" name="reason" rows={2} maxLength={500} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : isReassign ? "Reassign" : "Assign"}
      </button>
    </form>
  );
}

export function StaffMessageForm({ ticketNumber }) {
  const [state, formAction, pending] = useActionState(staffMessageAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <div>
        <label htmlFor="visibility" className="mb-1 block text-sm font-medium">Who can see this?</label>
        <select id="visibility" name="visibility" required defaultValue="" className={field}>
          <option value="" disabled>Choose</option>
          <option value="PUBLIC">Public reply (resident can see)</option>
          <option value="INTERNAL">Internal note (staff only)</option>
        </select>
      </div>
      <div>
        <label htmlFor="staff-body" className="mb-1 block text-sm font-medium">Message</label>
        <textarea id="staff-body" name="body" rows={3} required minLength={2} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save message"}
      </button>
    </form>
  );
}
