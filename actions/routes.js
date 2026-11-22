"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import CollectionRoute from "@/models/CollectionRoute";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  ROUTE_STATUSES,
  ROUTE_STATUS_FROM,
  ROUTE_REASON_REQUIRED,
  MIN_STOPS_TO_ACTIVATE,
  normalizeName,
  nameKeyOf,
  parseStops,
} from "@/lib/routeRules";

const idPattern = /^[a-f\d]{24}$/i;
const objectId = z.string().regex(idPattern, "Invalid selection");

const nameField = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name is too long (100 characters maximum)")
  .refine((v) => nameKeyOf(v).length > 0, "Name must contain letters or numbers");

const createSchema = z.object({ zoneId: objectId, name: nameField });
const updateSchema = z.object({ routeId: objectId, name: nameField });

function refresh() {
  revalidatePath("/admin/routes");
}

// The collector is optional. If one is given, it must be active and belong to the route's zone.
async function checkCollector(collectorId, zoneId) {
  if (!collectorId) return { ok: true, id: undefined };
  if (!idPattern.test(collectorId)) return { ok: false, error: "The selected collector is not available." };
  const collector = await User.findOne({
    _id: collectorId,
    role: "COLLECTOR",
    status: "ACTIVE",
    deletedAt: null,
  })
    .select("serviceZone")
    .lean();
  if (!collector) return { ok: false, error: "The selected collector is not available." };
  if (!collector.serviceZone || String(collector.serviceZone) !== String(zoneId)) {
    return { ok: false, error: "This collector is not assigned to the zone of the route." };
  }
  return { ok: true, id: collector._id };
}

export async function createRouteAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    zoneId: String(formData.get("zoneId") || ""),
    name: String(formData.get("name") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const stops = parseStops(String(formData.get("stops") || ""));
  if (stops.error) return { error: "Stops: " + stops.error };
  const d = parsed.data;

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: d.zoneId, status: "ACTIVE", deletedAt: null }).select("_id").lean();
    if (!zone) return { error: "The selected zone is not available." };

    const collector = await checkCollector(String(formData.get("collectorId") || ""), zone._id);
    if (!collector.ok) return { error: collector.error };

    const created = await CollectionRoute.create({
      serviceZone: zone._id,
      name: normalizeName(d.name),
      nameKey: nameKeyOf(d.name),
      collector: collector.id,
      stops: stops.items,
      status: "DRAFT",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "route.create",
      targetType: "CollectionRoute",
      targetId: created._id.toString(),
      metadata: { name: created.name, zone: d.zoneId, stops: stops.items.length },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "This zone already has a route with this name." };
    console.error("Create route failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Route saved as a draft. Activate it when the collector and stops are ready." };
}

export async function updateRouteAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse({
    routeId: String(formData.get("routeId") || ""),
    name: String(formData.get("name") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const stops = parseStops(String(formData.get("stops") || ""));
  if (stops.error) return { error: "Stops: " + stops.error };
  const d = parsed.data;
  const collectorValue = String(formData.get("collectorId") || "");

  try {
    await connectDB();
    const current = await CollectionRoute.findOne({ _id: d.routeId, deletedAt: null })
      .select("serviceZone status")
      .lean();
    if (!current) return { error: "Route not found." };
    if (current.status === "INACTIVE") {
      return { error: "An inactive route cannot be edited. Reactivate it first." };
    }
    if (current.status === "ACTIVE") {
      if (!collectorValue) return { error: "An active route needs a collector." };
      if (stops.items.length < MIN_STOPS_TO_ACTIVATE) {
        return { error: "An active route needs at least " + MIN_STOPS_TO_ACTIVATE + " stops." };
      }
    }

    const collector = await checkCollector(collectorValue, current.serviceZone);
    if (!collector.ok) return { error: collector.error };

    const set = { name: normalizeName(d.name), nameKey: nameKeyOf(d.name), stops: stops.items };
    const update = { $set: set };
    if (collector.id) set.collector = collector.id;
    else update.$unset = { collector: "" };

    // The zone is never changed. The status is part of the filter, so a change that happened meanwhile is not overwritten.
    const updated = await CollectionRoute.findOneAndUpdate(
      { _id: d.routeId, deletedAt: null, status: current.status },
      update,
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This route was changed by someone else. Please reload and try again." };

    await writeAudit({
      actor: user.id,
      action: "route.update",
      targetType: "CollectionRoute",
      targetId: d.routeId,
      metadata: { name: set.name, stops: stops.items.length },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "This zone already has a route with this name." };
    console.error("Update route failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Route updated." };
}

const statusSchema = z.object({
  routeId: objectId,
  target: z.enum(ROUTE_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long (300 characters maximum)").optional(),
});

export async function setRouteStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    routeId: String(formData.get("routeId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { routeId: id, target, reason } = parsed.data;

  if (!ROUTE_STATUS_FROM[target]) return { error: "This route cannot be moved to that status." };

  const needsReason = ROUTE_REASON_REQUIRED.includes(target);
  if (needsReason && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a route." };
  }

  try {
    await connectDB();
    const filter = { _id: id, deletedAt: null, status: { $in: ROUTE_STATUS_FROM[target] } };
    let update;

    if (target === "ACTIVE") {
      const current = await CollectionRoute.findOne({ _id: id, deletedAt: null })
        .select("serviceZone collector stops")
        .lean();
      if (!current) return { error: "Route not found." };
      if (!current.collector) return { error: "Choose a collector before activating this route." };
      if ((current.stops || []).length < MIN_STOPS_TO_ACTIVATE) {
        return { error: "A route needs at least " + MIN_STOPS_TO_ACTIVATE + " stops before it can be activated." };
      }
      const zone = await ServiceZone.findOne({ _id: current.serviceZone, status: "ACTIVE", deletedAt: null })
        .select("_id")
        .lean();
      if (!zone) return { error: "The zone of this route is not active." };
      const collector = await checkCollector(String(current.collector), current.serviceZone);
      if (!collector.ok) return { error: "The collector of this route is no longer available in this zone." };

      // The same rules are part of the update filter, so two requests at the same time cannot skip them.
      // "stops.1" means the route has at least two stops (MIN_STOPS_TO_ACTIVATE).
      filter.collector = { $ne: null };
      filter["stops.1"] = { $exists: true };
      update = { $set: { status: "ACTIVE" }, $unset: { statusReason: "" } };
    } else {
      update = { $set: { status: target, statusReason: reason } };
    }

    const updated = await CollectionRoute.findOneAndUpdate(filter, update, { returnDocument: "after" }).select("_id");
    if (!updated) return { error: "This route cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "route.status." + target.toLowerCase(),
      targetType: "CollectionRoute",
      targetId: id,
      reason: needsReason ? reason : undefined,
    });
  } catch (err) {
    console.error("Set route status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "ACTIVE" ? "Route activated." : "Route deactivated." };
}
