"use client";

import { useActionState, useState } from "react";
import { createScheduleAction, setScheduleStatusAction } from "@/actions/schedules";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const dangerButton = "min-h-11 rounded-md bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50";

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

// zones: [{ id, name }]   collectors: [{ id, name, zoneId }]   weekdays: [{ value, label }]
export function ScheduleForm({ zones, collectors, weekdays }) {
  const [state, formAction, pending] = useActionState(createScheduleAction, null);
  const [zoneId, setZoneId] = useState("");
  const options = collectors.filter((c) => c.zoneId === zoneId);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="sc-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="sc-zone" name="zoneId" required value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sc-collector" className="mb-1 block text-sm font-medium">Responsible collector (same zone only)</label>
        <select id="sc-collector" name="collectorId" required defaultValue="" disabled={!zoneId} className={field}>
          <option value="" disabled>{zoneId ? "Select a collector" : "Choose a zone first"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {zoneId && options.length === 0 && (
          <p className="mt-1 text-sm text-amber-900">No active collector is assigned to this zone yet.</p>
        )}
      </div>
      <div>
        <label htmlFor="sc-day" className="mb-1 block text-sm font-medium">Day of the week (repeats weekly)</label>
        <select id="sc-day" name="weekday" required defaultValue="" className={field}>
          <option value="" disabled>Select a day</option>
          {weekdays.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sc-start" className="mb-1 block text-sm font-medium">Window starts (24-hour)</label>
          <input id="sc-start" name="startTime" type="time" required className={field} />
        </div>
        <div>
          <label htmlFor="sc-end" className="mb-1 block text-sm font-medium">Window ends (24-hour)</label>
          <input id="sc-end" name="endTime" type="time" required className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="sc-note" className="mb-1 block text-sm font-medium">Note (optional)</label>
        <input id="sc-note" name="note" type="text" maxLength={200} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save schedule (draft)"}
      </button>
    </form>
  );
}

export function ConfirmScheduleForm({ scheduleId }) {
  const [state, formAction, pending] = useActionState(setScheduleStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="target" value="CONFIRMED" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Confirming..." : "Confirm schedule"}
      </button>
    </form>
  );
}

export function CancelScheduleForm({ scheduleId }) {
  const [state, formAction, pending] = useActionState(setScheduleStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="target" value="CANCELLED" />
      <div>
        <label htmlFor={"cancel-" + scheduleId} className="mb-1 block text-sm font-medium">
          Reason for cancelling (at least 10 characters)
        </label>
        <input id={"cancel-" + scheduleId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Cancelling..." : "Cancel schedule"}
      </button>
    </form>
  );
}
