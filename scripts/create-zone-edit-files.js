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
  "lib/reportStatus.js",
  "models/ServiceZone.js",
  "models/WasteReport.js",
  "actions/zones.js",
  "components/forms/ZoneForm.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
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

write("lib/zoneStatus.js", `
export const ZONE_STATUSES = ["ACTIVE", "INACTIVE"];

export const ZONE_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const ZONE_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const ZONE_REASON_REQUIRED = ["INACTIVE"];

export function zoneTargets(status) {
  return ZONE_STATUSES.filter((t) => ZONE_STATUS_FROM[t].includes(status));
}
`);

write("tests/unit/zoneStatus.test.js", `
import { describe, it, expect } from "vitest";
import {
  ZONE_STATUSES,
  ZONE_STATUS_LABELS,
  ZONE_STATUS_FROM,
  ZONE_REASON_REQUIRED,
  zoneTargets,
} from "@/lib/zoneStatus";

describe("zone status", () => {
  it("has a label for every status", () => {
    ZONE_STATUSES.forEach((s) => expect(ZONE_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses", () => {
    Object.entries(ZONE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ZONE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ZONE_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active zone and reactivate on an inactive zone", () => {
    expect(zoneTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(zoneTargets("INACTIVE")).toEqual(["ACTIVE"]);
  });

  it("offers nothing for an unknown status", () => {
    expect(zoneTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(ZONE_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});
`);

write("actions/zones.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { ZONE_STATUSES, ZONE_STATUS_FROM, ZONE_REASON_REQUIRED } from "@/lib/zoneStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid zone");

const zoneFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().max(500).optional(),
  targetCollectionEveryDays: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Minimum is 1 day")
    .max(30, "Maximum is 30 days"),
};

const createSchema = z.object(zoneFields);
const updateSchema = z.object({ zoneId: objectId, ...zoneFields });

function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function refresh() {
  revalidatePath("/admin/zones");
  revalidatePath("/report-garbage");
}

export async function createZoneAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetCollectionEveryDays: formData.get("targetCollectionEveryDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const slug = makeSlug(parsed.data.name);
  if (!slug) return { error: "Name must contain letters or numbers" };

  try {
    await connectDB();
    const zone = await ServiceZone.create({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      targetCollectionEveryDays: parsed.data.targetCollectionEveryDays,
    });
    await writeAudit({
      actor: user.id,
      action: "zone.create",
      targetType: "ServiceZone",
      targetId: zone._id.toString(),
      metadata: { name: zone.name, slug: zone.slug },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return { error: "A zone with this name already exists." };
    }
    console.error("Create zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Zone created." };
}

export async function updateZoneAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse({
    zoneId: formData.get("zoneId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetCollectionEveryDays: formData.get("targetCollectionEveryDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    // The slug is never changed, so existing links keep working.
    const updated = await ServiceZone.findOneAndUpdate(
      { _id: d.zoneId, deletedAt: null },
      {
        $set: {
          name: d.name,
          description: d.description || "",
          targetCollectionEveryDays: d.targetCollectionEveryDays,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Zone not found." };

    await writeAudit({
      actor: user.id,
      action: "zone.update",
      targetType: "ServiceZone",
      targetId: d.zoneId,
      metadata: { name: d.name, targetCollectionEveryDays: d.targetCollectionEveryDays },
    });
  } catch (err) {
    console.error("Update zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Zone updated." };
}

const statusSchema = z.object({
  zoneId: objectId,
  target: z.enum(ZONE_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

export async function setZoneStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    zoneId: formData.get("zoneId"),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { zoneId, target, reason } = parsed.data;

  if (ZONE_REASON_REQUIRED.includes(target) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a zone." };
  }

  try {
    await connectDB();

    if (target === "INACTIVE") {
      const open = await WasteReport.countDocuments({
        serviceZone: zoneId,
        deletedAt: null,
        status: { $nin: CLOSED_STATUSES },
      });
      if (open > 0) {
        return {
          error:
            "This zone still has " + open + " open report(s). Finish or close them before deactivating the zone.",
        };
      }
    }

    const updated = await ServiceZone.findOneAndUpdate(
      { _id: zoneId, deletedAt: null, status: { $in: ZONE_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This zone cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "zone.status." + target.toLowerCase(),
      targetType: "ServiceZone",
      targetId: zoneId,
      reason: ZONE_REASON_REQUIRED.includes(target) ? reason : undefined,
    });
  } catch (err) {
    console.error("Set zone status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "INACTIVE" ? "Zone deactivated." : "Zone reactivated." };
}
`);

write("components/forms/ZoneForm.js", `
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
`);

write("app/admin/(panel)/zones/page.js", `
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import { requirePermission } from "@/lib/auth/guards";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import ZoneForm, { EditZoneForm, DeactivateZoneForm, ReactivateZoneForm } from "@/components/forms/ZoneForm";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Service Zones | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  await requirePermission("collections.manage");

  let zones = [];
  const openByZone = {};
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
    const counts = await WasteReport.aggregate([
      { $match: { deletedAt: null, status: { $nin: CLOSED_STATUSES } } },
      { $group: { _id: "$serviceZone", count: { $sum: 1 } } },
    ]);
    counts.forEach((c) => {
      openByZone[String(c._id)] = c.count;
    });
  } catch (err) {
    console.error("Load zones failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Service Zones</h1>
        <p className="mt-1 text-sm text-gray-600">
          Zones decide where services are available and how often collection is targeted. An inactive zone no longer
          appears on the report form. A zone with open reports cannot be deactivated.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Zones could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && zones.length === 0 && (
          <div className="mt-4">
            <EmptyState>No zones yet. Create the first one below.</EmptyState>
          </div>
        )}

        {zones.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Target (days)</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2 pr-4">Created</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => {
                  const id = z._id.toString();
                  const plain = {
                    id,
                    name: z.name,
                    description: z.description || "",
                    targetCollectionEveryDays: z.targetCollectionEveryDays,
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{z.name}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={z.status} label={ZONE_STATUS_LABELS[z.status]} />
                      </td>
                      <td className="py-2 pr-4">{z.targetCollectionEveryDays}</td>
                      <td className="py-2 pr-4">{openByZone[id] || 0}</td>
                      <td className="py-2 pr-4">{new Date(z.createdAt).toISOString().slice(0, 10)}</td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditZoneForm zone={plain} />
                          </details>
                          {z.status === "ACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-red-800">Deactivate</summary>
                              <DeactivateZoneForm zoneId={id} />
                            </details>
                          )}
                          {z.status === "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                              <ReactivateZoneForm zoneId={id} />
                            </details>
                          )}
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
        <h2 className="mb-4 text-lg font-semibold">Create a zone</h2>
        <ZoneForm />
      </section>
    </div>
  );
}
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
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    const checks = (src.match(/requireActionPermission\(/g) || []).length;
    if (checks < 3) problems.push("every action must check permission (found " + checks + ")");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient/.test(src)) {
    problems.push("animation or gradient classes are not allowed");
  }
  if (f.startsWith("app/") && !src.includes("@/components/ui/StatusBadge")) problems.push("page does not use StatusBadge");
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, then npm run build.");