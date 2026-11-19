"use client";

import { useActionState } from "react";
import {
  createNeighborhoodAction,
  updateNeighborhoodAction,
  setNeighborhoodStatusAction,
} from "@/actions/neighborhoods";

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

// zones: [{ id, name }]
export default function NeighborhoodForm({ zones }) {
  const [state, formAction, pending] = useActionState(createNeighborhoodAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="new-nb-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="new-nb-zone" name="zoneId" required defaultValue="" className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="new-nb-name" className="mb-1 block text-sm font-medium">Neighborhood name</label>
        <input id="new-nb-name" name="name" type="text" required minLength={2} maxLength={100} className={field} />
      </div>
      <div>
        <label htmlFor="new-nb-desc" className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id="new-nb-desc" name="description" rows={2} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Add neighborhood"}
      </button>
    </form>
  );
}

// neighborhood: { id, name, description, zoneName }
export function EditNeighborhoodForm({ neighborhood }) {
  const [state, formAction, pending] = useActionState(updateNeighborhoodAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="neighborhoodId" value={neighborhood.id} />
      <p className="text-sm text-gray-700">
        Zone: <span className="font-semibold">{neighborhood.zoneName}</span> (cannot be changed)
      </p>
      <div>
        <label htmlFor={"edit-nb-name-" + neighborhood.id} className="mb-1 block text-sm font-medium">Neighborhood name</label>
        <input id={"edit-nb-name-" + neighborhood.id} name="name" type="text" required minLength={2} maxLength={100}
          defaultValue={neighborhood.name} className={field} />
      </div>
      <div>
        <label htmlFor={"edit-nb-desc-" + neighborhood.id} className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id={"edit-nb-desc-" + neighborhood.id} name="description" rows={2} maxLength={300}
          defaultValue={neighborhood.description} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function NeighborhoodStatusForm({ neighborhoodId, target, label, needsReason, danger }) {
  const [state, formAction, pending] = useActionState(setNeighborhoodStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="neighborhoodId" value={neighborhoodId} />
      <input type="hidden" name="target" value={target} />
      {needsReason && (
        <div>
          <label htmlFor={"nb-reason-" + neighborhoodId} className="mb-1 block text-sm font-medium">
            Reason (at least 10 characters)
          </label>
          <input id={"nb-reason-" + neighborhoodId} name="reason" type="text" required minLength={10} maxLength={300}
            className={field} />
        </div>
      )}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={danger ? dangerButton : button}>
        {pending ? "Saving..." : label}
      </button>
    </form>
  );
}
