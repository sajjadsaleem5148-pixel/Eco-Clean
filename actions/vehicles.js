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

const zoneId = z.string().regex(/^[a-f\d]{24}$/i, "Please choose a valid zone");
const vehicleId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid vehicle");

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
