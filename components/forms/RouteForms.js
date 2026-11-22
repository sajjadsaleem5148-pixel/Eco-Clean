"use client";

import { useActionState, useState } from "react";
import { createRouteAction, updateRouteAction, setRouteStatusAction } from "@/actions/routes";

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

function StopsField({ idPrefix, value }) {
  return (
    <div>
      <label htmlFor={idPrefix + "-stops"} className="mb-1 block text-sm font-medium">
        Stops in order, one per line (up to 40)
      </label>
      <textarea id={idPrefix + "-stops"} name="stops" rows={6} defaultValue={value || ""} className={field} />
      <p className="mt-1 text-xs text-gray-600">
        Write street or area names yourself. No map or distance is calculated. A route needs at least 2 stops to be activated.
      </p>
    </div>
  );
}

// zones: [{ id, name }]   collectors: [{ id, name, zoneId }]
export default function RouteForm({ zones, collectors }) {
  const [state, formAction, pending] = useActionState(createRouteAction, null);
  const [zoneId, setZoneId] = useState("");
  const options = collectors.filter((c) => c.zoneId === zoneId);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="new-route-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="new-route-zone" name="zoneId" required value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="new-route-name" className="mb-1 block text-sm font-medium">Route name</label>
        <input id="new-route-name" name="name" type="text" required minLength={2} maxLength={100} className={field} />
      </div>
      <div>
        <label htmlFor="new-route-collector" className="mb-1 block text-sm font-medium">Collector (same zone only, optional for a draft)</label>
        <select id="new-route-collector" name="collectorId" defaultValue="" disabled={!zoneId} className={field}>
          <option value="">{zoneId ? "No collector yet" : "Choose a zone first"}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {zoneId && options.length === 0 && (
          <p className="mt-1 text-sm text-amber-900">No active collector is assigned to this zone yet.</p>
        )}
      </div>
      <StopsField idPrefix="new-route" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save route (draft)"}
      </button>
    </form>
  );
}

// route: { id, name, collectorId, stops (text), zoneName }   collectors: [{ id, name }] of the same zone
export function EditRouteForm({ route, collectors }) {
  const [state, formAction, pending] = useActionState(updateRouteAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="routeId" value={route.id} />
      <p className="text-sm text-gray-700">
        Zone: <span className="font-semibold">{route.zoneName}</span> (cannot be changed)
      </p>
      <div>
        <label htmlFor={"edit-route-name-" + route.id} className="mb-1 block text-sm font-medium">Route name</label>
        <input id={"edit-route-name-" + route.id} name="name" type="text" required minLength={2} maxLength={100}
          defaultValue={route.name} className={field} />
      </div>
      <div>
        <label htmlFor={"edit-route-collector-" + route.id} className="mb-1 block text-sm font-medium">Collector</label>
        <select id={"edit-route-collector-" + route.id} name="collectorId" defaultValue={route.collectorId} className={field}>
          <option value="">No collector</option>
          {collectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <StopsField idPrefix={"edit-route-" + route.id} value={route.stops} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function RouteStatusForm({ routeId, target, label, needsReason, danger }) {
  const [state, formAction, pending] = useActionState(setRouteStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="target" value={target} />
      {needsReason && (
        <div>
          <label htmlFor={"route-reason-" + routeId} className="mb-1 block text-sm font-medium">
            Reason (at least 10 characters)
          </label>
          <input id={"route-reason-" + routeId} name="reason" type="text" required minLength={10} maxLength={300}
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
