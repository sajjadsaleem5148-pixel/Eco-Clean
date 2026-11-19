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

write("lib/neighborhoodRules.js", `
export const NEIGHBORHOOD_STATUSES = ["ACTIVE", "INACTIVE"];

export const NEIGHBORHOOD_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const NEIGHBORHOOD_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const NEIGHBORHOOD_REASON_REQUIRED = ["INACTIVE"];

export function neighborhoodTargets(status) {
  return NEIGHBORHOOD_STATUSES.filter((t) => NEIGHBORHOOD_STATUS_FROM[t].includes(status));
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same neighborhood.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}
`);

write("models/Neighborhood.js", `
import mongoose from "mongoose";
import { NEIGHBORHOOD_STATUSES } from "@/lib/neighborhoodRules";

const neighborhoodSchema = new mongoose.Schema(
  {
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: NEIGHBORHOOD_STATUSES, default: "ACTIVE", index: true },
    statusReason: { type: String, maxlength: 300 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The same name may exist in different zones, but only once inside one zone.
neighborhoodSchema.index({ serviceZone: 1, nameKey: 1 }, { unique: true });

export default mongoose.models.Neighborhood || mongoose.model("Neighborhood", neighborhoodSchema);
`);

write("actions/neighborhoods.js", `
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

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid selection");

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
`);

write("components/forms/NeighborhoodForms.js", `
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
`);

write("app/admin/(panel)/neighborhoods/page.js", `
import connectDB from "@/lib/db/connect";
import Neighborhood from "@/models/Neighborhood";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import {
  NEIGHBORHOOD_STATUSES,
  NEIGHBORHOOD_STATUS_LABELS,
  NEIGHBORHOOD_REASON_REQUIRED,
  neighborhoodTargets,
} from "@/lib/neighborhoodRules";
import NeighborhoodForm, {
  EditNeighborhoodForm,
  NeighborhoodStatusForm,
} from "@/components/forms/NeighborhoodForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Neighborhoods | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(zone, status) {
  const params = new URLSearchParams();
  if (zone) params.set("zone", zone);
  if (status) params.set("status", status);
  const qs = params.toString();
  return "/admin/neighborhoods" + (qs ? "?" + qs : "");
}

function targetLabel(target) {
  return target === "INACTIVE" ? "Deactivate neighborhood" : "Reactivate neighborhood";
}

export default async function AdminNeighborhoodsPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = NEIGHBORHOOD_STATUSES.includes(sp?.status) ? sp.status : null;
  const zoneRaw = typeof sp?.zone === "string" ? sp.zone : "";
  const zoneFilter = /^[a-f\\d]{24}$/i.test(zoneRaw) ? zoneRaw : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (zoneFilter) filter.serviceZone = zoneFilter;

  let items = [];
  let allZones = [];
  let loadError = false;
  try {
    await connectDB();
    const [list, zones] = await Promise.all([
      Neighborhood.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("serviceZone", "name status")
        .lean(),
      ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name status").lean(),
    ]);
    items = list;
    allZones = zones;
  } catch (err) {
    console.error("Load neighborhoods failed:", err.message);
    loadError = true;
  }

  const activeZones = allZones.filter((z) => z.status === "ACTIVE").map((z) => ({ id: z._id.toString(), name: z.name }));
  const tabs = [{ label: "All", href: href(zoneFilter, null), active: !status }].concat(
    NEIGHBORHOOD_STATUSES.map((s) => ({
      label: NEIGHBORHOOD_STATUS_LABELS[s],
      href: href(zoneFilter, s),
      active: status === s,
    }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Neighborhoods</h1>
        <p className="mt-1 text-sm text-gray-600">
          A neighborhood belongs to one service zone and cannot be moved to another. Neighborhoods are not linked to
          reports, residents or schedules yet. The same name can be used in different zones.
        </p>

        <form action="/admin/neighborhoods" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone</label>
            <select id="zone" name="zone" defaultValue={zoneFilter}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All zones</option>
              {allZones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
            Apply
          </button>
        </form>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Neighborhoods could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No neighborhoods match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Neighborhood</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => {
                  const id = n._id.toString();
                  const zoneName = n.serviceZone ? n.serviceZone.name : "-";
                  const plain = { id: id, name: n.name, description: n.description || "", zoneName: zoneName };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{n.name}</span>
                        {n.description && <span className="block text-xs text-gray-600">{n.description}</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {zoneName}
                        {n.serviceZone && n.serviceZone.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Zone is inactive</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={n.status} label={NEIGHBORHOOD_STATUS_LABELS[n.status]} />
                        {n.status === "INACTIVE" && n.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {n.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditNeighborhoodForm neighborhood={plain} />
                          </details>
                          {neighborhoodTargets(n.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {targetLabel(t)}
                              </summary>
                              <NeighborhoodStatusForm
                                neighborhoodId={id}
                                target={t}
                                label={targetLabel(t)}
                                needsReason={NEIGHBORHOOD_REASON_REQUIRED.includes(t)}
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
        <h2 className="mb-4 text-lg font-semibold">Add a neighborhood</h2>
        {activeZones.length === 0 ? (
          <EmptyState>No active zones. Create a zone first.</EmptyState>
        ) : (
          <NeighborhoodForm zones={activeZones} />
        )}
      </section>
    </div>
  );
}
`);

write("tests/unit/neighborhoodRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  NEIGHBORHOOD_STATUSES,
  NEIGHBORHOOD_STATUS_LABELS,
  NEIGHBORHOOD_STATUS_FROM,
  NEIGHBORHOOD_REASON_REQUIRED,
  neighborhoodTargets,
  normalizeName,
  nameKeyOf,
} from "@/lib/neighborhoodRules";

describe("neighborhood status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    NEIGHBORHOOD_STATUSES.forEach((s) => expect(NEIGHBORHOOD_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(NEIGHBORHOOD_STATUS_FROM).forEach(([to, froms]) => {
      expect(NEIGHBORHOOD_STATUSES).toContain(to);
      froms.forEach((f) => expect(NEIGHBORHOOD_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active neighborhood and reactivate on an inactive one", () => {
    expect(neighborhoodTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(neighborhoodTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(neighborhoodTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(NEIGHBORHOOD_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});

describe("names", () => {
  it("normalises spacing", () => {
    expect(normalizeName("  North   Block ")).toBe("North Block");
    expect(normalizeName(null)).toBe("");
  });

  it("treats different spellings of one name as the same key", () => {
    expect(nameKeyOf("North Block")).toBe("northblock");
    expect(nameKeyOf("north-block")).toBe("northblock");
    expect(nameKeyOf("  NORTH   BLOCK. ")).toBe("northblock");
    expect(nameKeyOf("North Block 2")).not.toBe(nameKeyOf("North Block"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});
`);

write("tests/integration/neighborhoods.test.js", `
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
import {
  createNeighborhoodAction,
  updateNeighborhoodAction,
  setNeighborhoodStatusAction,
} from "@/actions/neighborhoods";
import Neighborhood from "@/models/Neighborhood";
import ServiceZone from "@/models/ServiceZone";
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

function makeNeighborhood(zone, name, extra) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Neighborhood.create(
    Object.assign({ serviceZone: zone._id, name: name, nameKey: key, status: "ACTIVE" }, extra || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function createForm(zone, overrides) {
  return form(Object.assign({ zoneId: String(zone._id), name: "North  Block", description: "Near the market" }, overrides || {}));
}

describe("createNeighborhoodAction", () => {
  it("adds a neighborhood with a clean name and an audit entry", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const out = await run(() => createNeighborhoodAction(null, createForm(zone)));
    expect(out.result.success).toBeTruthy();
    const saved = await Neighborhood.findOne({}).lean();
    expect(saved.name).toBe("North Block");
    expect(saved.nameKey).toBe("northblock");
    expect(saved.status).toBe("ACTIVE");
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "neighborhood.create" })).toBe(1);
  });

  it("refuses the same name written in another way inside one zone", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    await run(() => createNeighborhoodAction(null, createForm(zone)));
    for (const name of ["north block", "NORTH-BLOCK.", " North   Block "]) {
      const out = await run(() => createNeighborhoodAction(null, createForm(zone, { name: name })));
      expect(out.result.error).toMatch(/already has/i);
    }
    expect(await Neighborhood.countDocuments({})).toBe(1);
  });

  it("allows the same name in a different zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await asOperations();
    const first = await run(() => createNeighborhoodAction(null, createForm(a)));
    const second = await run(() => createNeighborhoodAction(null, createForm(b)));
    expect(first.result.success).toBeTruthy();
    expect(second.result.success).toBeTruthy();
    expect(await Neighborhood.countDocuments({})).toBe(2);
  });

  it("creates only one neighborhood when the same name arrives twice at the same time", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const results = await Promise.all([
      run(() => createNeighborhoodAction(null, createForm(zone))),
      run(() => createNeighborhoodAction(null, createForm(zone, { name: "north-block" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Neighborhood.countDocuments({})).toBe(1);
  });

  it("refuses an inactive zone, an unknown zone, a bad id and a symbol-only name", async () => {
    const inactive = await makeZone("Zone B", { status: "INACTIVE" });
    const zone = await makeZone("Zone A");
    await asOperations();
    const a = await run(() => createNeighborhoodAction(null, createForm(inactive)));
    expect(a.result.error).toMatch(/not available/i);
    const b = await run(() => createNeighborhoodAction(null, createForm({ _id: "507f1f77bcf86cd799439011" })));
    expect(b.result.error).toMatch(/not available/i);
    const c = await run(() => createNeighborhoodAction(null, createForm({ _id: "nope" })));
    expect(c.result.error).toMatch(/invalid/i);
    const d = await run(() => createNeighborhoodAction(null, createForm(zone, { name: "!!!" })));
    expect(d.result.error).toMatch(/letters or numbers/i);
    expect(await Neighborhood.countDocuments({})).toBe(0);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    const zone = await makeZone("Zone A");
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createNeighborhoodAction(null, createForm(zone)));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createNeighborhoodAction(null, createForm(zone)));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Neighborhood.countDocuments({})).toBe(0);
  });
});

describe("updateNeighborhoodAction", () => {
  function updateForm(id, overrides) {
    return form(Object.assign({ neighborhoodId: String(id), name: "Renamed Block", description: "New text" }, overrides || {}));
  }

  it("renames a neighborhood but never moves it to another zone", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Old Block");
    await asOperations();
    const out = await run(() => updateNeighborhoodAction(null, updateForm(n._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Neighborhood.findById(n._id).lean();
    expect(saved.name).toBe("Renamed Block");
    expect(saved.nameKey).toBe("renamedblock");
    expect(saved.description).toBe("New text");
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "neighborhood.update" })).toBe(1);
  });

  it("refuses a name that another neighborhood in the same zone uses, but allows it in another zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await makeNeighborhood(a, "Taken Name");
    const inA = await makeNeighborhood(a, "Other Name");
    const inB = await makeNeighborhood(b, "Third Name");
    await asOperations();
    const clash = await run(() => updateNeighborhoodAction(null, updateForm(inA._id, { name: "taken-name" })));
    expect(clash.result.error).toMatch(/already has/i);
    expect((await Neighborhood.findById(inA._id).lean()).name).toBe("Other Name");
    const fine = await run(() => updateNeighborhoodAction(null, updateForm(inB._id, { name: "taken-name" })));
    expect(fine.result.success).toBeTruthy();
  });

  it("refuses a bad id, an unknown neighborhood and a role without permission", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();
    const a = await run(() => updateNeighborhoodAction(null, updateForm("nope")));
    expect(a.result.error).toMatch(/invalid/i);
    const b = await run(() => updateNeighborhoodAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const c = await run(() => updateNeighborhoodAction(null, updateForm(n._id)));
    expect(c.result.error).toMatch(/permission/i);
  });
});

describe("setNeighborhoodStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ neighborhoodId: String(id), target: target, reason: reason });
  }

  it("needs a real reason to deactivate, then reactivates", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();

    const none = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Merged into the neighbouring block"))
    );
    expect(ok.result.success).toBeTruthy();
    let saved = await Neighborhood.findById(n._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Merged into the neighbouring block");

    const twice = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await Neighborhood.findById(n._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: "neighborhood.status.inactive" })).toBe(1);
  });

  it("does not reactivate a neighborhood whose zone is inactive", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const n = await makeNeighborhood(zone, "Some Block", { status: "INACTIVE" });
    await asOperations();
    const out = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "ACTIVE")));
    expect(out.result.error).toMatch(/zone is not active/i);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("INACTIVE");
  });

  it("lets only one request win when two deactivations arrive at the same time", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();
    const results = await Promise.all([
      run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "First request at the same time"))),
      run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Second request at the same time"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "neighborhood.status.inactive" })).toBe(1);
  });

  it("refuses a resident, a content manager and a visitor", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() =>
        setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "I should not be allowed to"))
      );
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Nobody is logged in here"))
    );
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("ACTIVE");
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
  if (f === "app/admin/(panel)/neighborhoods/page.js" && !src.includes('requirePermission("collections.manage")')) {
    problems.push("missing page permission check");
  }
  if (f === "models/Neighborhood.js" && !src.includes("unique: true")) problems.push("zone and name key must be unique");
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