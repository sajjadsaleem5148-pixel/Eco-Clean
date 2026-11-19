const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/permissions/roles.js",
  "models/ServiceZone.js",
  "models/AuditLog.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/vehicleRules.js", `
export const VEHICLE_TYPES = {
  TRUCK: "Truck",
  PICKUP: "Pickup",
  VAN: "Van",
  HANDCART: "Handcart or small cart",
  OTHER: "Other",
};

export const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"];

export const VEHICLE_STATUS_LABELS = {
  ACTIVE: "Active",
  MAINTENANCE: "In maintenance",
  RETIRED: "Retired",
};

// New status -> the statuses it may come from. A retired vehicle never comes back.
export const VEHICLE_STATUS_FROM = {
  ACTIVE: ["MAINTENANCE"],
  MAINTENANCE: ["ACTIVE"],
  RETIRED: ["ACTIVE", "MAINTENANCE"],
};

export const VEHICLE_REASON_REQUIRED = ["MAINTENANCE", "RETIRED"];

// Reuses the existing badge colours: green, amber and red.
export const VEHICLE_BADGE = {
  ACTIVE: "ACTIVE",
  MAINTENANCE: "PENDING",
  RETIRED: "ARCHIVED",
};

export const TARGET_LABELS = {
  ACTIVE: "Return to service",
  MAINTENANCE: "Send to maintenance",
  RETIRED: "Retire vehicle",
};

export function vehicleTargets(status) {
  return VEHICLE_STATUSES.filter((t) => VEHICLE_STATUS_FROM[t].includes(status));
}

export const PLATE_PATTERN = /^[A-Z0-9][A-Z0-9 -]{2,14}$/;

export function normalizePlate(value) {
  return String(value == null ? "" : value).toUpperCase().replace(/\\s+/g, " ").trim();
}

export function isValidPlate(value) {
  return PLATE_PATTERN.test(normalizePlate(value));
}

// Spaces and hyphens are ignored, so ABC 123, ABC-123 and abc123 are the same vehicle.
export function plateKeyOf(value) {
  return normalizePlate(value).replace(/[ -]/g, "");
}
`);

write("models/Vehicle.js", `
import mongoose from "mongoose";
import { VEHICLE_TYPES, VEHICLE_STATUSES } from "@/lib/vehicleRules";

const vehicleSchema = new mongoose.Schema(
  {
    plate: { type: String, required: true, trim: true, maxlength: 15 },
    plateKey: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.keys(VEHICLE_TYPES), required: true },
    capacityKg: { type: Number, required: true, min: 1, max: 50000 },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", index: true },
    status: { type: String, enum: VEHICLE_STATUSES, default: "ACTIVE", index: true },
    statusReason: { type: String, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);
`);

write("actions/vehicles.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Vehicle from "@/models/Vehicle";
import ServiceZone from "@/models/ServiceZone";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_FROM,
  VEHICLE_REASON_REQUIRED,
  isValidPlate,
  normalizePlate,
  plateKeyOf,
} from "@/lib/vehicleRules";

const zoneId = z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a valid zone");
const vehicleId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid vehicle");

const shared = {
  type: z.enum(Object.keys(VEHICLE_TYPES), { message: "Please choose a vehicle type" }),
  capacityKg: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Capacity must be at least 1 kg")
    .max(50000, "Capacity is too large (50000 kg maximum)"),
  serviceZone: zoneId.optional(),
  notes: z.string().trim().max(300, "Notes are too long (300 characters maximum)").optional(),
};

const createSchema = z.object(
  Object.assign(
    {
      plate: z
        .string()
        .trim()
        .refine(isValidPlate, "Enter a valid plate number (3 to 15 letters, numbers, spaces or hyphens)"),
    },
    shared
  )
);
const updateSchema = z.object(Object.assign({ vehicleId: vehicleId }, shared));

function refresh() {
  revalidatePath("/admin/vehicles");
}

async function checkZone(id) {
  if (!id) return { ok: true, id: undefined };
  const zone = await ServiceZone.findOne({ _id: id, status: "ACTIVE", deletedAt: null }).select("_id").lean();
  return zone ? { ok: true, id: zone._id } : { ok: false };
}

export async function createVehicleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    plate: String(formData.get("plate") || ""),
    type: formData.get("type"),
    capacityKg: formData.get("capacityKg"),
    serviceZone: formData.get("serviceZone") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const zone = await checkZone(d.serviceZone);
    if (!zone.ok) return { error: "The selected zone is not available." };

    const created = await Vehicle.create({
      plate: normalizePlate(d.plate),
      plateKey: plateKeyOf(d.plate),
      type: d.type,
      capacityKg: d.capacityKg,
      serviceZone: zone.id,
      notes: d.notes,
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "vehicle.create",
      targetType: "Vehicle",
      targetId: created._id.toString(),
      metadata: { plate: created.plate, type: d.type, capacityKg: d.capacityKg },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A vehicle with this plate number already exists." };
    console.error("Create vehicle failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vehicle added." };
}

export async function updateVehicleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse({
    vehicleId: String(formData.get("vehicleId") || ""),
    type: formData.get("type"),
    capacityKg: formData.get("capacityKg"),
    serviceZone: formData.get("serviceZone") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const zone = await checkZone(d.serviceZone);
    if (!zone.ok) return { error: "The selected zone is not available." };

    const set = { type: d.type, capacityKg: d.capacityKg, notes: d.notes || "" };
    const update = { $set: set };
    if (zone.id) set.serviceZone = zone.id;
    else update.$unset = { serviceZone: "" };

    // The plate is never changed here, and a retired vehicle cannot be edited.
    const updated = await Vehicle.findOneAndUpdate(
      { _id: d.vehicleId, deletedAt: null, status: { $ne: "RETIRED" } },
      update,
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Vehicle not found, or it is retired and cannot be edited." };

    await writeAudit({
      actor: user.id,
      action: "vehicle.update",
      targetType: "Vehicle",
      targetId: d.vehicleId,
      metadata: { type: d.type, capacityKg: d.capacityKg },
    });
  } catch (err) {
    console.error("Update vehicle failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vehicle updated." };
}

const statusSchema = z.object({
  vehicleId: vehicleId,
  target: z.enum(VEHICLE_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long (300 characters maximum)").optional(),
});

export async function setVehicleStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    vehicleId: String(formData.get("vehicleId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { vehicleId: id, target, reason } = parsed.data;

  const needsReason = VEHICLE_REASON_REQUIRED.includes(target);
  if (needsReason && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required for this change." };
  }

  try {
    await connectDB();
    const update = needsReason
      ? { $set: { status: target, statusReason: reason } }
      : { $set: { status: target }, $unset: { statusReason: "" } };

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Vehicle.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: VEHICLE_STATUS_FROM[target] } },
      update,
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This vehicle cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "vehicle.status." + target.toLowerCase(),
      targetType: "Vehicle",
      targetId: id,
      reason: needsReason ? reason : undefined,
    });
  } catch (err) {
    console.error("Set vehicle status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vehicle status updated." };
}
`);

write("components/forms/VehicleForms.js", `
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
`);

write("app/admin/(panel)/vehicles/page.js", `
import connectDB from "@/lib/db/connect";
import Vehicle from "@/models/Vehicle";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_BADGE,
  VEHICLE_REASON_REQUIRED,
  TARGET_LABELS,
  vehicleTargets,
} from "@/lib/vehicleRules";
import VehicleForm, { EditVehicleForm, VehicleStatusForm } from "@/components/forms/VehicleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Vehicles | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/vehicles" + (status ? "?status=" + status : "");
}

export default async function AdminVehiclesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = VEHICLE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let vehicles = [];
  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    const [v, z] = await Promise.all([
      Vehicle.find(filter).sort({ createdAt: -1 }).limit(200).populate("serviceZone", "name").lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).select("name").lean(),
    ]);
    vehicles = v;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load vehicles failed:", err.message);
    loadError = true;
  }

  const types = Object.entries(VEHICLE_TYPES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    VEHICLE_STATUSES.map((s) => ({ label: VEHICLE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is the fleet record. Vehicles are not linked to schedules or jobs yet. A retired vehicle cannot be edited
          or returned to service.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Vehicles could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && vehicles.length === 0 && (
          <div className="mt-4">
            <EmptyState>No vehicles match this filter.</EmptyState>
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Plate</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Capacity (kg)</th>
                  <th scope="col" className="py-2 pr-4">Home zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const id = v._id.toString();
                  const plain = {
                    id: id,
                    plate: v.plate,
                    type: v.type,
                    capacityKg: v.capacityKg,
                    zoneId: v.serviceZone ? v.serviceZone._id.toString() : "",
                    notes: v.notes || "",
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{v.plate}</td>
                      <td className="py-2 pr-4">{VEHICLE_TYPES[v.type] || v.type}</td>
                      <td className="py-2 pr-4">{v.capacityKg}</td>
                      <td className="py-2 pr-4">{v.serviceZone ? v.serviceZone.name : "Any zone"}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={VEHICLE_BADGE[v.status]} label={VEHICLE_STATUS_LABELS[v.status]} />
                        {v.statusReason && <span className="mt-1 block text-xs text-gray-600">Reason: {v.statusReason}</span>}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {v.status !== "RETIRED" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditVehicleForm vehicle={plain} types={types} zones={zones} />
                            </details>
                          )}
                          {vehicleTargets(v.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "RETIRED" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {TARGET_LABELS[t]}
                              </summary>
                              <VehicleStatusForm
                                vehicleId={id}
                                target={t}
                                label={TARGET_LABELS[t]}
                                needsReason={VEHICLE_REASON_REQUIRED.includes(t)}
                                danger={t === "RETIRED"}
                              />
                            </details>
                          ))}
                          {v.status === "RETIRED" && <span className="text-xs text-gray-600">Retired</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Add a vehicle</h2>
        <VehicleForm types={types} zones={zones} />
      </section>
    </div>
  );
}
`);

write("tests/unit/vehicleRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_FROM,
  VEHICLE_REASON_REQUIRED,
  VEHICLE_BADGE,
  vehicleTargets,
  normalizePlate,
  isValidPlate,
  plateKeyOf,
} from "@/lib/vehicleRules";

describe("vehicle status", () => {
  it("has a label and a badge for every status", () => {
    VEHICLE_STATUSES.forEach((s) => {
      expect(VEHICLE_STATUS_LABELS[s]).toBeTruthy();
      expect(VEHICLE_BADGE[s]).toBeTruthy();
    });
  });

  it("only refers to real statuses", () => {
    Object.entries(VEHICLE_STATUS_FROM).forEach(([to, froms]) => {
      expect(VEHICLE_STATUSES).toContain(to);
      froms.forEach((f) => expect(VEHICLE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps and never lets a retired vehicle return", () => {
    expect(vehicleTargets("ACTIVE")).toEqual(["MAINTENANCE", "RETIRED"]);
    expect(vehicleTargets("MAINTENANCE")).toEqual(["ACTIVE", "RETIRED"]);
    expect(vehicleTargets("RETIRED")).toEqual([]);
    expect(vehicleTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason for maintenance and retirement only", () => {
    expect(VEHICLE_REASON_REQUIRED).toEqual(["MAINTENANCE", "RETIRED"]);
  });

  it("has five vehicle types", () => {
    expect(Object.keys(VEHICLE_TYPES)).toHaveLength(5);
  });
});

describe("plate numbers", () => {
  it("normalises case and spacing", () => {
    expect(normalizePlate("  abc   123 ")).toBe("ABC 123");
    expect(normalizePlate(null)).toBe("");
  });

  it("accepts normal plates and rejects odd ones", () => {
    ["ABC 123", "abc-123", "KHI 4567", "LEA-21-1234"].forEach((p) => expect(isValidPlate(p)).toBe(true));
    ["", "ab", "-ABC", "ABC<123>", "A".repeat(16), "ABC;DROP"].forEach((p) => expect(isValidPlate(p)).toBe(false));
  });

  it("treats different spellings of one plate as the same key", () => {
    expect(plateKeyOf("abc 123")).toBe("ABC123");
    expect(plateKeyOf("ABC-123")).toBe("ABC123");
    expect(plateKeyOf("abc123")).toBe("ABC123");
    expect(plateKeyOf("ABC 124")).not.toBe(plateKeyOf("ABC 123"));
  });
});
`);

write("tests/integration/vehicles.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createVehicleAction, updateVehicleAction, setVehicleStatusAction } from "@/actions/vehicles";
import Vehicle from "@/models/Vehicle";
import ServiceZone from "@/models/ServiceZone";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function vehicleForm(overrides) {
  return form(
    Object.assign({ plate: "abc  123", type: "TRUCK", capacityKg: "2000", serviceZone: "", notes: "" }, overrides || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function makeVehicle(overrides) {
  return Vehicle.create(
    Object.assign({ plate: "XYZ 999", plateKey: "XYZ999", type: "VAN", capacityKg: 500 }, overrides || {})
  );
}

describe("createVehicleAction", () => {
  it("adds a vehicle with a normalised plate and an audit entry", async () => {
    await asOperations();
    const out = await run(() => createVehicleAction(null, vehicleForm()));
    expect(out.result.success).toBeTruthy();
    const saved = await Vehicle.findOne({}).lean();
    expect(saved.plate).toBe("ABC 123");
    expect(saved.plateKey).toBe("ABC123");
    expect(saved.status).toBe("ACTIVE");
    expect(saved.capacityKg).toBe(2000);
    expect(await AuditLog.countDocuments({ action: "vehicle.create" })).toBe(1);
  });

  it("refuses the same plate written in another way", async () => {
    await asOperations();
    await run(() => createVehicleAction(null, vehicleForm()));
    for (const plate of ["ABC-123", "abc123", " ABC 123 "]) {
      const out = await run(() => createVehicleAction(null, vehicleForm({ plate: plate })));
      expect(out.result.error).toMatch(/already exists/i);
    }
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("creates only one vehicle when the same plate arrives twice at the same time", async () => {
    await asOperations();
    const results = await Promise.all([
      run(() => createVehicleAction(null, vehicleForm())),
      run(() => createVehicleAction(null, vehicleForm({ plate: "ABC-123" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("refuses a bad plate, a bad capacity and an unknown type", async () => {
    await asOperations();
    const a = await run(() => createVehicleAction(null, vehicleForm({ plate: "A;B" })));
    expect(a.result.error).toMatch(/plate/i);
    const b = await run(() => createVehicleAction(null, vehicleForm({ capacityKg: "0" })));
    expect(b.result.error).toMatch(/at least 1/i);
    const c = await run(() => createVehicleAction(null, vehicleForm({ capacityKg: "50001" })));
    expect(c.result.error).toMatch(/too large/i);
    const d = await run(() => createVehicleAction(null, vehicleForm({ type: "SPACESHIP" })));
    expect(d.result.error).toMatch(/type/i);
    expect(await Vehicle.countDocuments({})).toBe(0);
  });

  it("accepts an active zone and refuses an inactive one", async () => {
    const good = await makeZone("Zone A");
    const bad = await makeZone("Zone B", { status: "INACTIVE" });
    await asOperations();
    const ok = await run(() => createVehicleAction(null, vehicleForm({ serviceZone: String(good._id) })));
    expect(ok.result.success).toBeTruthy();
    const no = await run(() => createVehicleAction(null, vehicleForm({ plate: "DEF 456", serviceZone: String(bad._id) })));
    expect(no.result.error).toMatch(/not available/i);
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createVehicleAction(null, vehicleForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createVehicleAction(null, vehicleForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Vehicle.countDocuments({})).toBe(0);
  });
});

describe("updateVehicleAction", () => {
  function updateForm(id, overrides) {
    return form(Object.assign({ vehicleId: String(id), type: "PICKUP", capacityKg: "800", serviceZone: "", notes: "Old but reliable" }, overrides || {}));
  }

  it("changes the details but never the plate, and can clear the zone", async () => {
    const zone = await makeZone("Zone A");
    const v = await makeVehicle({ serviceZone: zone._id });
    await asOperations();
    const out = await run(() => updateVehicleAction(null, updateForm(v._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Vehicle.findById(v._id).lean();
    expect(saved.type).toBe("PICKUP");
    expect(saved.capacityKg).toBe(800);
    expect(saved.notes).toBe("Old but reliable");
    expect(saved.serviceZone).toBeUndefined();
    expect(saved.plate).toBe("XYZ 999");
    expect(await AuditLog.countDocuments({ action: "vehicle.update" })).toBe(1);
  });

  it("does not edit a retired vehicle, a missing vehicle or with a bad id", async () => {
    const retired = await makeVehicle({ status: "RETIRED" });
    await asOperations();
    const a = await run(() => updateVehicleAction(null, updateForm(retired._id)));
    expect(a.result.error).toMatch(/retired/i);
    const b = await run(() => updateVehicleAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);
    const c = await run(() => updateVehicleAction(null, updateForm("nope")));
    expect(c.result.error).toMatch(/invalid/i);
    expect((await Vehicle.findById(retired._id).lean()).type).toBe("VAN");
  });

  it("refuses a content manager", async () => {
    const v = await makeVehicle();
    const user = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(user);
    const out = await run(() => updateVehicleAction(null, updateForm(v._id)));
    expect(out.result.error).toMatch(/permission/i);
  });
});

describe("setVehicleStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ vehicleId: String(id), target: target, reason: reason });
  }

  it("needs a real reason for maintenance, then returns the vehicle to service", async () => {
    const v = await makeVehicle();
    await asOperations();

    const none = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Engine service this week")));
    expect(ok.result.success).toBeTruthy();
    let saved = await Vehicle.findById(v._id).lean();
    expect(saved.status).toBe("MAINTENANCE");
    expect(saved.statusReason).toBe("Engine service this week");

    const again = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Trying the same thing twice")));
    expect(again.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setVehicleStatusAction(null, statusForm(v._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await Vehicle.findById(v._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
  });

  it("never lets a retired vehicle come back", async () => {
    const v = await makeVehicle();
    await asOperations();
    const retire = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "Sold after the accident")));
    expect(retire.result.success).toBeTruthy();
    for (const target of ["ACTIVE", "MAINTENANCE"]) {
      const out = await run(() => setVehicleStatusAction(null, statusForm(v._id, target, "Trying to bring it back")));
      expect(out.result.error).toMatch(/cannot be moved/i);
    }
    expect((await Vehicle.findById(v._id).lean()).status).toBe("RETIRED");
    expect(await AuditLog.countDocuments({ action: "vehicle.status.retired" })).toBe(1);
  });

  it("lets only one request win when two arrive at the same time", async () => {
    const v = await makeVehicle();
    await asOperations();
    const results = await Promise.all([
      run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "First request at the same time"))),
      run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Second request at the same time"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "vehicle.status.maintenance" })).toBe(1);
  });

  it("refuses a resident, a content manager and a visitor", async () => {
    const v = await makeVehicle();
    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "I should not be allowed to")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "Nobody is logged in here")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("ACTIVE");
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if ((src.match(/requireActionPermission\("collections.manage"\)/g) || []).length < 3) {
      problems.push("every action must check collections.manage");
    }
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/vehicles/page.js" && !src.includes('requirePermission("collections.manage")')) {
    problems.push("missing page permission check");
  }
  if (f === "models/Vehicle.js" && !src.includes("unique: true")) problems.push("plate key must be unique");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");