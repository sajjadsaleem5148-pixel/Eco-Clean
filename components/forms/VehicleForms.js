"use client";

import { useActionState } from "react";
import { createVehicleAction, updateVehicleAction, setVehicleStatusAction } from "@/actions/vehicles";

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

// types: [{ value, label }]   zones: [{ id, name }]   vehicle: { id, plate, type, capacityKg, zoneId, notes }
function SharedFields({ idPrefix, types, zones, vehicle }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-type"} className="mb-1 block text-sm font-medium">Vehicle type</label>
        <select id={idPrefix + "-type"} name="type" required defaultValue={vehicle ? vehicle.type : ""} className={field}>
          <option value="" disabled>Select a type</option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={idPrefix + "-cap"} className="mb-1 block text-sm font-medium">Capacity (kg)</label>
        <input id={idPrefix + "-cap"} name="capacityKg" type="number" required min={1} max={50000} step={1}
          defaultValue={vehicle ? vehicle.capacityKg : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-zone"} className="mb-1 block text-sm font-medium">Home zone (optional)</label>
        <select id={idPrefix + "-zone"} name="serviceZone" defaultValue={vehicle ? vehicle.zoneId : ""} className={field}>
          <option value="">Any zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={idPrefix + "-notes"} className="mb-1 block text-sm font-medium">Notes (optional)</label>
        <input id={idPrefix + "-notes"} name="notes" type="text" maxLength={300}
          defaultValue={vehicle ? vehicle.notes : ""} className={field} />
      </div>
    </>
  );
}

export default function VehicleForm({ types, zones }) {
  const [state, formAction, pending] = useActionState(createVehicleAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="new-veh-plate" className="mb-1 block text-sm font-medium">Plate number</label>
        <input id="new-veh-plate" name="plate" type="text" required minLength={3} maxLength={15} className={field} />
      </div>
      <SharedFields idPrefix="new-veh" types={types} zones={zones} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Add vehicle"}
      </button>
    </form>
  );
}

export function EditVehicleForm({ vehicle, types, zones }) {
  const [state, formAction, pending] = useActionState(updateVehicleAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="vehicleId" value={vehicle.id} />
      <p className="text-sm text-gray-700">Plate number: <span className="font-semibold">{vehicle.plate}</span> (cannot be changed)</p>
      <SharedFields idPrefix={"edit-veh-" + vehicle.id} types={types} zones={zones} vehicle={vehicle} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function VehicleStatusForm({ vehicleId, target, label, needsReason, danger }) {
  const [state, formAction, pending] = useActionState(setVehicleStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="target" value={target} />
      {needsReason && (
        <div>
          <label htmlFor={"veh-reason-" + target + "-" + vehicleId} className="mb-1 block text-sm font-medium">
            Reason (at least 10 characters)
          </label>
          <input id={"veh-reason-" + target + "-" + vehicleId} name="reason" type="text" required minLength={10}
            maxLength={300} className={field} />
        </div>
      )}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={danger ? dangerButton : button}>
        {pending ? "Saving..." : label}
      </button>
    </form>
  );
}
