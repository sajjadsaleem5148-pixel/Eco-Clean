"use client";

import { useActionState } from "react";
import { createZoneAction, updateZoneAction, setZoneStatusAction } from "@/actions/zones";

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

function ZoneFields({ idPrefix, zone }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-name"} className="mb-1 block text-sm font-medium">Zone name</label>
        <input id={idPrefix + "-name"} name="name" type="text" required maxLength={120}
          defaultValue={zone ? zone.name : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-desc"} className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id={idPrefix + "-desc"} name="description" rows={3} maxLength={500}
          defaultValue={zone ? zone.description : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-days"} className="mb-1 block text-sm font-medium">
          Target: collect every N days (a service target, not a guarantee)
        </label>
        <input id={idPrefix + "-days"} name="targetCollectionEveryDays" type="number" min={1} max={30}
          defaultValue={zone ? zone.targetCollectionEveryDays : 3} required className={field} />
      </div>
    </>
  );
}

export default function ZoneForm() {
  const [state, formAction, pending] = useActionState(createZoneAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <ZoneFields idPrefix="new" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create zone"}
      </button>
    </form>
  );
}

export function EditZoneForm({ zone }) {
  const [state, formAction, pending] = useActionState(updateZoneAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="zoneId" value={zone.id} />
      <ZoneFields idPrefix={"edit-" + zone.id} zone={zone} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function DeactivateZoneForm({ zoneId }) {
  const [state, formAction, pending] = useActionState(setZoneStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="target" value="INACTIVE" />
      <div>
        <label htmlFor={"deact-" + zoneId} className="mb-1 block text-sm font-medium">
          Reason for deactivating (at least 10 characters)
        </label>
        <input id={"deact-" + zoneId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Deactivating..." : "Deactivate zone"}
      </button>
    </form>
  );
}

export function ReactivateZoneForm({ zoneId }) {
  const [state, formAction, pending] = useActionState(setZoneStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="zoneId" value={zoneId} />
      <input type="hidden" name="target" value="ACTIVE" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reactivating..." : "Reactivate zone"}
      </button>
    </form>
  );
}
