const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? (the schedule script must have run first) ----
const required = [
  "models/CollectionSchedule.js",
  "lib/scheduleStatus.js",
  "actions/schedules.js",
  "models/ServiceZone.js",
  "models/User.js",
  "lib/auth/guards.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first (create-schedule-files.js):");
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

write("services/scheduleQueries.js", `
import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";

function byDayThenTime(a, b) {
  return a.weekday - b.weekday || a.startTime.localeCompare(b.startTime);
}

// For residents: confirmed schedules of one active zone. The collector is never selected.
export async function confirmedForZone(zoneId) {
  await connectDB();
  const zone = await ServiceZone.findOne({ _id: zoneId, status: "ACTIVE", deletedAt: null })
    .select("name")
    .lean();
  if (!zone) return { zone: null, schedules: [] };

  const list = await CollectionSchedule.find({ serviceZone: zone._id, status: "CONFIRMED" })
    .select("weekday startTime endTime")
    .lean();

  return {
    zone: { id: zone._id.toString(), name: zone.name },
    schedules: list
      .map((s) => ({ id: s._id.toString(), weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }))
      .sort(byDayThenTime),
  };
}

// For a collector: only that collector's own confirmed schedules.
export async function confirmedForCollector(collectorId) {
  await connectDB();
  const list = await CollectionSchedule.find({ collector: collectorId, status: "CONFIRMED" })
    .populate("serviceZone", "name")
    .select("serviceZone weekday startTime endTime note")
    .lean();

  return list
    .map((s) => ({
      id: s._id.toString(),
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note || "",
      zoneName: s.serviceZone ? s.serviceZone.name : "-",
    }))
    .sort(byDayThenTime);
}
`);

write("actions/household.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";

const schema = z.object({
  zoneId: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a zone"),
});

export async function saveZoneAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({ zoneId: formData.get("zoneId") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: parsed.data.zoneId, status: "ACTIVE", deletedAt: null })
      .select("_id")
      .lean();
    if (!zone) return { error: "The selected zone is not available." };

    // The id comes from the server session, never from the form.
    await User.updateOne({ _id: user.id, deletedAt: null }, { $set: { serviceZone: zone._id } });
  } catch (err) {
    console.error("Save zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/household");
  revalidatePath("/dashboard/collections");
  return { success: "Your service zone was saved." };
}
`);

write("components/forms/HouseholdForm.js", `
"use client";

import { useActionState } from "react";
import { saveZoneAction } from "@/actions/household";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function HouseholdForm({ zones, currentId }) {
  const [state, formAction, pending] = useActionState(saveZoneAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="hh-zone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="hh-zone" name="zoneId" required defaultValue={currentId || ""} className={field}>
          <option value="" disabled>Select your zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save zone"}
      </button>
    </form>
  );
}
`);

write("app/dashboard/household/page.js", `
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import HouseholdForm from "@/components/forms/HouseholdForm";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Household | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function HouseholdPage() {
  const user = await requireRole(["RESIDENT"]);

  let zones = [];
  let currentId = "";
  let loadError = false;
  try {
    await connectDB();
    const [list, me] = await Promise.all([
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
      User.findById(user.id).select("serviceZone").lean(),
    ]);
    zones = list.map((z) => ({ id: z._id.toString(), name: z.name }));
    if (me && me.serviceZone) currentId = me.serviceZone.toString();
  } catch (err) {
    console.error("Load household failed:", err.message);
    loadError = true;
  }

  const currentIsActive = zones.some((z) => z.id === currentId);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Household</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your service zone decides which confirmed collection schedule you see. Choose the zone where your household is.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your household could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && currentId && !currentIsActive && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Your saved zone is no longer active. Please choose another zone.
        </p>
      )}
      {!loadError && zones.length === 0 && (
        <div className="mt-4">
          <EmptyState>No service zones are available yet.</EmptyState>
        </div>
      )}
      {!loadError && zones.length > 0 && (
        <div className="mt-4">
          <HouseholdForm zones={zones} currentId={currentIsActive ? currentId : ""} />
        </div>
      )}
    </section>
  );
}
`);

write("app/dashboard/collections/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requireRole } from "@/lib/auth/guards";
import { confirmedForZone } from "@/services/scheduleQueries";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Collections | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyCollectionsPage() {
  const user = await requireRole(["RESIDENT"]);

  let hasZone = false;
  let zone = null;
  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    const me = await User.findById(user.id).select("serviceZone").lean();
    if (me && me.serviceZone) {
      hasZone = true;
      const result = await confirmedForZone(me.serviceZone);
      zone = result.zone;
      schedules = result.schedules;
    }
  } catch (err) {
    console.error("Load collections failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Collections</h1>
      <p className="mt-1 text-sm text-gray-600">
        Only schedules that staff confirmed with a responsible collector are shown. Times are a service target, not a
        guarantee, and can change.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your schedule could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}

      {!loadError && !hasZone && (
        <div className="mt-4">
          <EmptyState>
            You have not chosen a service zone yet.{" "}
            <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Choose your zone</Link>
          </EmptyState>
        </div>
      )}

      {!loadError && hasZone && !zone && (
        <div className="mt-4">
          <EmptyState>
            Your saved zone is not active.{" "}
            <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Choose another zone</Link>
          </EmptyState>
        </div>
      )}

      {!loadError && zone && schedules.length === 0 && (
        <div className="mt-4">
          <EmptyState>No collection schedule has been confirmed for {zone.name} yet.</EmptyState>
        </div>
      )}

      {zone && schedules.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">{zone.name}</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {schedules.map((s) => (
              <li key={s.id}>{weekdayLabel(s.weekday)}: {formatWindow(s.startTime, s.endTime)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
`);

write("app/collector/schedule/page.js", `
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { confirmedForCollector } from "@/services/scheduleQueries";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Schedule | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorSchedulePage() {
  const user = await requireRole(["COLLECTOR"]);

  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    // Only this collector's own confirmed schedules; the id comes from the server session.
    schedules = await confirmedForCollector(user.id);
  } catch (err) {
    console.error("Load collector schedule failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
      <p className="mt-1 text-sm text-gray-600">
        These are the weekly collection windows that staff confirmed for you.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your schedule could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && schedules.length === 0 && (
        <div className="mt-4">
          <EmptyState>No schedule has been confirmed for you yet.</EmptyState>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Day</th>
                <th scope="col" className="py-2 pr-4">Window</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium">{weekdayLabel(s.weekday)}</td>
                  <td className="py-2 pr-4">{formatWindow(s.startTime, s.endTime)}</td>
                  <td className="py-2 pr-4">{s.zoneName}</td>
                  <td className="py-2">{s.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
`);

write("tests/integration/household.test.js", `
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
import { saveZoneAction } from "@/actions/household";
import { confirmedForZone, confirmedForCollector } from "@/services/scheduleQueries";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

async function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function makeSchedule(zone, collector, overrides) {
  return CollectionSchedule.create(
    Object.assign(
      {
        serviceZone: zone._id,
        collector: collector._id,
        weekday: 1,
        startTime: "08:00",
        endTime: "10:00",
        status: "CONFIRMED",
      },
      overrides || {}
    )
  );
}

describe("saveZoneAction", () => {
  it("saves an active zone on the signed-in resident only", async () => {
    const zone = await makeZone("Zone A");
    const resident = await makeUser();
    const other = await makeUser();
    signInAs(resident);

    const out = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(out.result.success).toBeTruthy();

    const saved = await User.findById(resident._id).lean();
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(saved.role).toBe("RESIDENT");
    const untouched = await User.findById(other._id).lean();
    expect(untouched.serviceZone).toBeUndefined();
  });

  it("refuses an inactive zone and a malformed id", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const resident = await makeUser();
    signInAs(resident);

    const a = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(a.result.error).toMatch(/not available/i);
    const b = await run(() => saveZoneAction(null, form({ zoneId: "not-an-id" })));
    expect(b.result.error).toMatch(/choose a zone/i);
    expect((await User.findById(resident._id).lean()).serviceZone).toBeUndefined();
  });

  it("refuses a collector, a staff account and a visitor", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR" });
    const admin = await makeUser({ role: "SUPER_ADMIN" });

    signInAs(collector);
    const a = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(admin);
    const b = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(b.result.error).toMatch(/permission/i);
    signOut();
    const c = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(c.result.error).toMatch(/permission/i);

    expect((await User.findById(collector._id).lean()).serviceZone).toBeUndefined();
  });
});

describe("confirmedForZone", () => {
  it("returns only confirmed schedules of that zone, without the collector", async () => {
    const zoneA = await makeZone("Zone A");
    const zoneB = await makeZone("Zone B");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zoneA._id });
    await makeSchedule(zoneA, collector, { weekday: 3, startTime: "09:00", endTime: "11:00" });
    await makeSchedule(zoneA, collector, { weekday: 1, startTime: "08:00", endTime: "10:00" });
    await makeSchedule(zoneA, collector, { weekday: 2, status: "DRAFT" });
    await makeSchedule(zoneA, collector, { weekday: 4, status: "CANCELLED" });
    await makeSchedule(zoneB, collector, { weekday: 5 });

    const result = await confirmedForZone(zoneA._id);
    expect(result.zone.name).toBe("Zone A");
    expect(result.schedules.map((s) => s.weekday)).toEqual([1, 3]);
    result.schedules.forEach((s) => {
      expect(Object.keys(s).sort()).toEqual(["endTime", "id", "startTime", "weekday"]);
    });
    expect(JSON.stringify(result).includes(String(collector._id))).toBe(false);
  });

  it("returns nothing for an inactive zone", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await makeSchedule(zone, collector);
    const result = await confirmedForZone(zone._id);
    expect(result.zone).toBeNull();
    expect(result.schedules).toEqual([]);
  });
});

describe("confirmedForCollector", () => {
  it("returns only this collector's confirmed schedules", async () => {
    const zone = await makeZone("Zone A");
    const mine = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const theirs = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await makeSchedule(zone, mine, { weekday: 2, note: "Use the back gate" });
    await makeSchedule(zone, mine, { weekday: 5, status: "DRAFT" });
    await makeSchedule(zone, theirs, { weekday: 3 });

    const list = await confirmedForCollector(mine._id);
    expect(list).toHaveLength(1);
    expect(list[0].weekday).toBe(2);
    expect(list[0].zoneName).toBe("Zone A");
    expect(list[0].note).toBe("Use the back gate");
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
    if (!src.includes('user.role !== "RESIDENT"')) problems.push("missing resident-only check");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient/.test(src)) {
    problems.push("animation or gradient classes are not allowed");
  }
  if (f.startsWith("app/") && !src.includes("requireRole(")) problems.push("missing page role check");
  if (f === "app/dashboard/collections/page.js" && /collector/i.test(src.replace(/collector's|collection/gi, ""))) {
    problems.push("resident page must not mention or load the collector");
  }
  if (f === "services/scheduleQueries.js") {
    const zoneFn = src.split("export async function confirmedForCollector")[0];
    if (/populate\\("collector/.test(zoneFn) || /select\\("[^"]*collector/.test(zoneFn)) {
      problems.push("zone query must never select the collector");
    }
  }
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm run test:integration, npm run build.");