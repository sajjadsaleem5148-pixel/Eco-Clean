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
  "models/User.js",
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

write("lib/routeRules.js", `
export const ROUTE_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"];

export const ROUTE_STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from. A route never goes back to draft.
export const ROUTE_STATUS_FROM = {
  ACTIVE: ["DRAFT", "INACTIVE"],
  INACTIVE: ["DRAFT", "ACTIVE"],
};

export const ROUTE_REASON_REQUIRED = ["INACTIVE"];

export const MIN_STOPS_TO_ACTIVATE = 2;
export const MAX_STOPS = 40;
export const MAX_STOP_LENGTH = 100;

export function routeTargets(status) {
  return Object.keys(ROUTE_STATUS_FROM).filter((t) => ROUTE_STATUS_FROM[t].includes(status));
}

export function routeTargetLabel(current, target) {
  if (target === "ACTIVE") return current === "DRAFT" ? "Activate route" : "Reactivate route";
  if (target === "INACTIVE") return "Deactivate route";
  return target;
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same route.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// One stop per line. The order is kept. Blank lines are dropped and repeats (any capitalisation) are kept once.
export function parseStops(text) {
  const lines = String(text == null ? "" : text)
    .split(/\\r?\\n/)
    .map((l) => l.replace(/\\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    if (line.length > MAX_STOP_LENGTH) {
      return { error: "each stop must be " + MAX_STOP_LENGTH + " characters or fewer." };
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }
  if (items.length > MAX_STOPS) {
    return { error: "use no more than " + MAX_STOPS + " stops." };
  }
  return { items };
}
`);

write("models/CollectionRoute.js", `
import mongoose from "mongoose";
import { ROUTE_STATUSES } from "@/lib/routeRules";

const routeSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    collector: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    stops: { type: [String], default: [] },
    status: { type: String, enum: ROUTE_STATUSES, default: "DRAFT", index: true },
    statusReason: { type: String, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The same name may exist in different zones, but only once inside one zone.
routeSchema.index({ serviceZone: 1, nameKey: 1 }, { unique: true });

export default mongoose.models.CollectionRoute || mongoose.model("CollectionRoute", routeSchema);
`);

write("actions/routes.js", `
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

const idPattern = /^[a-f\\d]{24}$/i;
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
`);

write("components/forms/RouteForms.js", `
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
`);

write("app/admin/(panel)/routes/page.js", `
import connectDB from "@/lib/db/connect";
import CollectionRoute from "@/models/CollectionRoute";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  ROUTE_STATUSES,
  ROUTE_STATUS_LABELS,
  ROUTE_REASON_REQUIRED,
  routeTargets,
  routeTargetLabel,
} from "@/lib/routeRules";
import RouteForm, { EditRouteForm, RouteStatusForm } from "@/components/forms/RouteForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Routes | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/routes" + (status ? "?status=" + status : "");
}

export default async function AdminRoutesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = ROUTE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let routes = [];
  let zones = [];
  let collectors = [];
  let loadError = false;
  try {
    await connectDB();
    const [r, z, c] = await Promise.all([
      CollectionRoute.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("serviceZone", "name status")
        .populate("collector", "name status")
        .lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).select("name").lean(),
      User.find({ role: "COLLECTOR", status: "ACTIVE", deletedAt: null, serviceZone: { $ne: null } })
        .sort({ name: 1 })
        .select("name serviceZone")
        .lean(),
    ]);
    routes = r;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    collectors = c.map((x) => ({ id: x._id.toString(), name: x.name, zoneId: x.serviceZone.toString() }));
  } catch (err) {
    console.error("Load routes failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    ROUTE_STATUSES.map((s) => ({ label: ROUTE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <p className="mt-1 text-sm text-gray-600">
          A route is a planning record: an ordered list of stops and one responsible collector in a zone. Routes are not
          linked to schedules, jobs or reports yet, and no map or distance is calculated. An inactive route cannot be edited.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Routes could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && routes.length === 0 && (
          <div className="mt-4">
            <EmptyState>No routes match this filter.</EmptyState>
          </div>
        )}

        {routes.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Route</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Collector</th>
                  <th scope="col" className="py-2 pr-4">Stops</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => {
                  const id = r._id.toString();
                  const zoneId = r.serviceZone ? r.serviceZone._id.toString() : "";
                  const zoneName = r.serviceZone ? r.serviceZone.name : "-";
                  const stops = r.stops || [];
                  const plain = {
                    id: id,
                    name: r.name,
                    collectorId: r.collector ? r.collector._id.toString() : "",
                    stops: stops.join("\\n"),
                    zoneName: zoneName,
                  };
                  const zoneCollectors = collectors.filter((c) => c.zoneId === zoneId);
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4">
                        {zoneName}
                        {r.serviceZone && r.serviceZone.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Zone is inactive</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {r.collector ? r.collector.name : <span className="text-gray-500">None</span>}
                        {r.collector && r.collector.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Collector is not active</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {stops.length}
                        {stops.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Show stops</summary>
                            <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-gray-800">
                              {stops.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={r.status} label={ROUTE_STATUS_LABELS[r.status]} />
                        {r.status === "INACTIVE" && r.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {r.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {r.status !== "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditRouteForm route={plain} collectors={zoneCollectors} />
                            </details>
                          )}
                          {routeTargets(r.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {routeTargetLabel(r.status, t)}
                              </summary>
                              <RouteStatusForm
                                routeId={id}
                                target={t}
                                label={routeTargetLabel(r.status, t)}
                                needsReason={ROUTE_REASON_REQUIRED.includes(t)}
                                danger={t === "INACTIVE"}
                              />
                            </details>
                          ))}
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
        <h2 className="mb-4 text-lg font-semibold">Add a route</h2>
        {zones.length === 0 ? (
          <EmptyState>No active zones. Create a zone first.</EmptyState>
        ) : (
          <RouteForm zones={zones} collectors={collectors} />
        )}
      </section>
    </div>
  );
}
`);

write("tests/unit/routeRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  ROUTE_STATUSES,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_FROM,
  ROUTE_REASON_REQUIRED,
  MIN_STOPS_TO_ACTIVATE,
  MAX_STOPS,
  routeTargets,
  routeTargetLabel,
  normalizeName,
  nameKeyOf,
  parseStops,
} from "@/lib/routeRules";

describe("route status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    ROUTE_STATUSES.forEach((s) => expect(ROUTE_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(ROUTE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ROUTE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ROUTE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps and never goes back to draft", () => {
    expect(routeTargets("DRAFT")).toEqual(["ACTIVE", "INACTIVE"]);
    expect(routeTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(routeTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(routeTargets("MADE_UP")).toEqual([]);
    expect(ROUTE_STATUS_FROM.DRAFT).toBeUndefined();
  });

  it("names the activate and reactivate buttons differently", () => {
    expect(routeTargetLabel("DRAFT", "ACTIVE")).toBe("Activate route");
    expect(routeTargetLabel("INACTIVE", "ACTIVE")).toBe("Reactivate route");
    expect(routeTargetLabel("ACTIVE", "INACTIVE")).toBe("Deactivate route");
  });

  it("requires a reason only to deactivate and two stops to activate", () => {
    expect(ROUTE_REASON_REQUIRED).toEqual(["INACTIVE"]);
    expect(MIN_STOPS_TO_ACTIVATE).toBe(2);
  });
});

describe("names", () => {
  it("normalises spacing and treats spellings of one name as the same key", () => {
    expect(normalizeName("  North   Loop ")).toBe("North Loop");
    expect(nameKeyOf("North Loop")).toBe("northloop");
    expect(nameKeyOf("north-loop.")).toBe("northloop");
    expect(nameKeyOf("North Loop 2")).not.toBe(nameKeyOf("North Loop"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});

describe("parseStops", () => {
  it("keeps the order, trims lines, drops blanks and repeats", () => {
    const r = parseStops("  Main Street \\n\\n Park Road\\r\\nmain  street\\nMarket Square");
    expect(r.items).toEqual(["Main Street", "Park Road", "Market Square"]);
  });

  it("returns an empty list for empty or missing text", () => {
    expect(parseStops("").items).toEqual([]);
    expect(parseStops(null).items).toEqual([]);
  });

  it("rejects too many stops and stops that are too long", () => {
    const many = Array.from({ length: MAX_STOPS + 1 }, (_, i) => "Stop " + i).join("\\n");
    expect(parseStops(many).error).toMatch(/40/);
    expect(parseStops("x".repeat(101)).error).toMatch(/100/);
    expect(parseStops("x".repeat(100)).items).toHaveLength(1);
    expect(parseStops(Array.from({ length: MAX_STOPS }, (_, i) => "Stop " + i).join("\\n")).items).toHaveLength(MAX_STOPS);
  });
});
`);

write("tests/integration/routes.test.js", `
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
import { createRouteAction, updateRouteAction, setRouteStatusAction } from "@/actions/routes";
import CollectionRoute from "@/models/CollectionRoute";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeRoute(zone, overrides) {
  return CollectionRoute.create(
    Object.assign(
      {
        serviceZone: zone._id,
        name: "North Loop",
        nameKey: "northloop",
        stops: ["Main Street", "Park Road"],
        status: "DRAFT",
      },
      overrides || {}
    )
  );
}

function createForm(zone, overrides) {
  return form(
    Object.assign(
      { zoneId: String(zone._id), name: "North  Loop", collectorId: "", stops: "Main Street\\nPark Road\\nmain street" },
      overrides || {}
    )
  );
}

describe("createRouteAction", () => {
  it("saves a draft with clean stops, in order, and an audit entry", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await asOperations();
    const out = await run(() => createRouteAction(null, createForm(zone, { collectorId: String(collector._id) })));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionRoute.findOne({}).lean();
    expect(saved.name).toBe("North Loop");
    expect(saved.nameKey).toBe("northloop");
    expect(saved.status).toBe("DRAFT");
    expect(saved.stops).toEqual(["Main Street", "Park Road"]);
    expect(String(saved.collector)).toBe(String(collector._id));
    expect(await AuditLog.countDocuments({ action: "route.create" })).toBe(1);
  });

  it("refuses a collector from another zone, a suspended collector and a bad id", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    const stranger = await makeUser({ role: "COLLECTOR", serviceZone: b._id });
    const suspended = await makeUser({ role: "COLLECTOR", serviceZone: a._id, status: "SUSPENDED" });
    await asOperations();
    const x = await run(() => createRouteAction(null, createForm(a, { collectorId: String(stranger._id) })));
    expect(x.result.error).toMatch(/not assigned to the zone/i);
    const y = await run(() => createRouteAction(null, createForm(a, { collectorId: String(suspended._id) })));
    expect(y.result.error).toMatch(/not available/i);
    const z = await run(() => createRouteAction(null, createForm(a, { collectorId: "nope" })));
    expect(z.result.error).toMatch(/not available/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });

  it("refuses the same name inside one zone but allows it in another zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await asOperations();
    await run(() => createRouteAction(null, createForm(a)));
    for (const name of ["north loop", "NORTH-LOOP.", " North   Loop "]) {
      const out = await run(() => createRouteAction(null, createForm(a, { name: name })));
      expect(out.result.error).toMatch(/already has/i);
    }
    const other = await run(() => createRouteAction(null, createForm(b)));
    expect(other.result.success).toBeTruthy();
    expect(await CollectionRoute.countDocuments({})).toBe(2);
  });

  it("creates only one route when the same name arrives twice at the same time", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const results = await Promise.all([
      run(() => createRouteAction(null, createForm(zone))),
      run(() => createRouteAction(null, createForm(zone, { name: "north-loop" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await CollectionRoute.countDocuments({})).toBe(1);
  });

  it("refuses too many stops, an inactive zone and a symbol-only name", async () => {
    const zone = await makeZone("Zone A");
    const off = await makeZone("Zone B", { status: "INACTIVE" });
    await asOperations();
    const many = Array.from({ length: 41 }, (_, i) => "Stop " + i).join("\\n");
    const a = await run(() => createRouteAction(null, createForm(zone, { stops: many })));
    expect(a.result.error).toMatch(/40/);
    const b = await run(() => createRouteAction(null, createForm(off)));
    expect(b.result.error).toMatch(/not available/i);
    const c = await run(() => createRouteAction(null, createForm(zone, { name: "!!!" })));
    expect(c.result.error).toMatch(/letters or numbers/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    const zone = await makeZone("Zone A");
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createRouteAction(null, createForm(zone)));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createRouteAction(null, createForm(zone)));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });
});

describe("updateRouteAction", () => {
  function updateForm(id, overrides) {
    return form(
      Object.assign({ routeId: String(id), name: "Renamed Loop", collectorId: "", stops: "One\\nTwo\\nThree" }, overrides || {})
    );
  }

  it("edits a draft but never moves it to another zone", async () => {
    const zone = await makeZone("Zone A");
    const route = await makeRoute(zone);
    await asOperations();
    const out = await run(() => updateRouteAction(null, updateForm(route._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.name).toBe("Renamed Loop");
    expect(saved.nameKey).toBe("renamedloop");
    expect(saved.stops).toEqual(["One", "Two", "Three"]);
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "route.update" })).toBe(1);
  });

  it("clears the collector when none is chosen", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    await run(() => updateRouteAction(null, updateForm(route._id)));
    expect((await CollectionRoute.findById(route._id).lean()).collector).toBeUndefined();
  });

  it("does not edit an inactive route, and keeps an active route valid", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const off = await makeRoute(zone, { name: "Old Loop", nameKey: "oldloop", status: "INACTIVE" });
    const live = await makeRoute(zone, { name: "Live Loop", nameKey: "liveloop", status: "ACTIVE", collector: collector._id });
    await asOperations();

    const a = await run(() => updateRouteAction(null, updateForm(off._id)));
    expect(a.result.error).toMatch(/inactive route cannot be edited/i);
    const b = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: "" })));
    expect(b.result.error).toMatch(/needs a collector/i);
    const c = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: String(collector._id), stops: "Only one" })));
    expect(c.result.error).toMatch(/at least 2/i);
    const d = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: String(collector._id) })));
    expect(d.result.success).toBeTruthy();
  });

  it("refuses a name used by another route in the same zone, a bad id, an unknown route and a role without permission", async () => {
    const zone = await makeZone("Zone A");
    await makeRoute(zone, { name: "Taken Name", nameKey: "takenname" });
    const route = await makeRoute(zone, { name: "Other Name", nameKey: "othername" });
    await asOperations();
    const a = await run(() => updateRouteAction(null, updateForm(route._id, { name: "taken-name" })));
    expect(a.result.error).toMatch(/already has/i);
    const b = await run(() => updateRouteAction(null, updateForm("nope")));
    expect(b.result.error).toMatch(/invalid/i);
    const c = await run(() => updateRouteAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(c.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const d = await run(() => updateRouteAction(null, updateForm(route._id)));
    expect(d.result.error).toMatch(/permission/i);
  });
});

describe("setRouteStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ routeId: String(id), target: target, reason: reason });
  }

  it("activates a route that has a collector and two stops", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    const out = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(out.result.success).toBeTruthy();
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("ACTIVE");
    expect(await AuditLog.countDocuments({ action: "route.status.active" })).toBe(1);
  });

  it("does not activate without a collector or with fewer than two stops", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const noCollector = await makeRoute(zone);
    const fewStops = await makeRoute(zone, { name: "Short Loop", nameKey: "shortloop", collector: collector._id, stops: ["Only one"] });
    await asOperations();
    const a = await run(() => setRouteStatusAction(null, statusForm(noCollector._id, "ACTIVE")));
    expect(a.result.error).toMatch(/choose a collector/i);
    const b = await run(() => setRouteStatusAction(null, statusForm(fewStops._id, "ACTIVE")));
    expect(b.result.error).toMatch(/at least 2 stops/i);
    expect((await CollectionRoute.findById(noCollector._id).lean()).status).toBe("DRAFT");
    expect((await CollectionRoute.findById(fewStops._id).lean()).status).toBe("DRAFT");
  });

  it("does not activate when the collector or the zone is no longer available", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();

    await User.updateOne({ _id: collector._id }, { $set: { status: "SUSPENDED" } });
    const a = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(a.result.error).toMatch(/no longer available/i);

    await User.updateOne({ _id: collector._id }, { $set: { status: "ACTIVE" } });
    await ServiceZone.updateOne({ _id: zone._id }, { $set: { status: "INACTIVE" } });
    const b = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(b.result.error).toMatch(/zone of this route is not active/i);
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("DRAFT");
  });

  it("needs a real reason to deactivate, then lets the route be reactivated", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id, status: "ACTIVE" });
    await asOperations();

    const none = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);

    const ok = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "Merged into the east route")));
    expect(ok.result.success).toBeTruthy();
    let saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Merged into the east route");

    const back = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
  });

  it("lets only one request win when two activations arrive at the same time", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    const results = await Promise.all([
      run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE"))),
      run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "route.status.active" })).toBe(1);
  });

  it("never moves a route back to draft, and refuses roles without permission", async () => {
    const zone = await makeZone("Zone A");
    const route = await makeRoute(zone);
    await asOperations();
    const draft = await run(() => setRouteStatusAction(null, statusForm(route._id, "DRAFT")));
    expect(draft.result.error).toMatch(/cannot be moved/i);

    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "I should not be allowed to")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "Nobody is logged in here")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("DRAFT");
  });
});
`);

// ---- Check 3: read every file back (comments are ignored, so a word in a comment cannot trigger a false alarm) ----
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(code)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if ((code.match(/requireActionPermission\("collections.manage"\)/g) || []).length < 3) {
      problems.push("every action must check collections.manage");
    }
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/routes/page.js" && !code.includes('requirePermission("collections.manage")')) {
    problems.push("missing page permission check");
  }
  if (f === "models/CollectionRoute.js" && !code.includes("unique: true")) problems.push("zone and name key must be unique");
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