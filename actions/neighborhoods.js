"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Neighborhood from "@/models/Neighborhood";
import ServiceZone from "@/models/ServiceZone";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  NEIGHBORHOOD_STATUSES,
  NEIGHBORHOOD_STATUS_FROM,
  NEIGHBORHOOD_REASON_REQUIRED,
  normalizeName,
  nameKeyOf,
} from "@/lib/neighborhoodRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid selection");

const shared = {
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long (100 characters maximum)")
    .refine((v) => nameKeyOf(v).length > 0, "Name must contain letters or numbers"),
  description: z.string().trim().max(300, "Description is too long (300 characters maximum)"),
};

const createSchema = z.object(Object.assign({ zoneId: objectId }, shared));
const updateSchema = z.object(Object.assign({ neighborhoodId: objectId }, shared));

function refresh() {
  revalidatePath("/admin/neighborhoods");
}

export async function createNeighborhoodAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    zoneId: String(formData.get("zoneId") || ""),
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: d.zoneId, status: "ACTIVE", deletedAt: null }).select("_id").lean();
    if (!zone) return { error: "The selected zone is not available." };

    const created = await Neighborhood.create({
      serviceZone: zone._id,
      name: normalizeName(d.name),
      nameKey: nameKeyOf(d.name),
      description: d.description,
      status: "ACTIVE",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "neighborhood.create",
      targetType: "Neighborhood",
      targetId: created._id.toString(),
      metadata: { name: created.name, zone: d.zoneId },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "This zone already has a neighborhood with this name." };
    console.error("Create neighborhood failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Neighborhood added." };
}

export async function updateNeighborhoodAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse({
    neighborhoodId: String(formData.get("neighborhoodId") || ""),
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    // The zone is never changed here.
    const updated = await Neighborhood.findOneAndUpdate(
      { _id: d.neighborhoodId, deletedAt: null },
      { $set: { name: normalizeName(d.name), nameKey: nameKeyOf(d.name), description: d.description } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Neighborhood not found." };

    await writeAudit({
      actor: user.id,
      action: "neighborhood.update",
      targetType: "Neighborhood",
      targetId: d.neighborhoodId,
      metadata: { name: normalizeName(d.name) },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "This zone already has a neighborhood with this name." };
    console.error("Update neighborhood failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Neighborhood updated." };
}

const statusSchema = z.object({
  neighborhoodId: objectId,
  target: z.enum(NEIGHBORHOOD_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long (300 characters maximum)").optional(),
});

export async function setNeighborhoodStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    neighborhoodId: String(formData.get("neighborhoodId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { neighborhoodId: id, target, reason } = parsed.data;

  const needsReason = NEIGHBORHOOD_REASON_REQUIRED.includes(target);
  if (needsReason && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a neighborhood." };
  }

  try {
    await connectDB();

    if (target === "ACTIVE") {
      const current = await Neighborhood.findOne({ _id: id, deletedAt: null }).select("serviceZone").lean();
      if (!current) return { error: "Neighborhood not found." };
      const zone = await ServiceZone.findOne({ _id: current.serviceZone, status: "ACTIVE", deletedAt: null })
        .select("_id")
        .lean();
      if (!zone) return { error: "Its zone is not active. Reactivate the zone first." };
    }

    const update = needsReason
      ? { $set: { status: target, statusReason: reason } }
      : { $set: { status: target }, $unset: { statusReason: "" } };

    // The old status is part of the filter, so two requests at the same time cannot both succeed.
    const updated = await Neighborhood.findOneAndUpdate(
      { _id: id, deletedAt: null, status: { $in: NEIGHBORHOOD_STATUS_FROM[target] } },
      update,
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This neighborhood cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "neighborhood.status." + target.toLowerCase(),
      targetType: "Neighborhood",
      targetId: id,
      reason: needsReason ? reason : undefined,
    });
  } catch (err) {
    console.error("Set neighborhood status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "INACTIVE" ? "Neighborhood deactivated." : "Neighborhood reactivated." };
}
