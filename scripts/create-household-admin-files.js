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
  "lib/reportStatus.js",
  "lib/zoneStatus.js",
  "models/ServiceZone.js",
  "models/User.js",
  "models/WasteReport.js",
  "models/Neighborhood.js",
  "models/CollectionSchedule.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "tests/integration/helpers.js",
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

write("lib/zoneCoverage.js", `
// Turns grouped database counts into one row per zone. Pure logic, no database access.

// rows: [{ _id, count }]. A missing _id (no zone) is stored under the key "none".
export function toCountMap(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    const key = r && r._id ? String(r._id) : "none";
    const count = r && typeof r.count === "number" ? r.count : 0;
    map[key] = (map[key] || 0) + count;
  });
  return map;
}

// Only an active zone can have a gap. An inactive zone is not expected to have staff or a schedule.
export function coverageGaps(row) {
  if (!row || row.status !== "ACTIVE") return [];
  const gaps = [];
  if (row.collectors === 0) gaps.push("No active collector");
  if (row.schedules === 0) gaps.push("No confirmed schedule");
  return gaps;
}

// zones: [{ _id, name, status }]
// maps: { residents, neighborhoods, collectors, schedules, openReports }, each made by toCountMap
export function buildCoverageRows(zones, maps) {
  const m = maps || {};
  const get = (name, id) => (m[name] && m[name][id]) || 0;
  const rows = (zones || []).map((z) => {
    const id = String(z._id);
    const row = {
      id: id,
      name: z.name,
      status: z.status,
      residents: get("residents", id),
      neighborhoods: get("neighborhoods", id),
      collectors: get("collectors", id),
      schedules: get("schedules", id),
      openReports: get("openReports", id),
    };
    row.gaps = coverageGaps(row);
    return row;
  });
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
`);

write("services/zoneCoverage.js", `
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import WasteReport from "@/models/WasteReport";
import Neighborhood from "@/models/Neighborhood";
import CollectionSchedule from "@/models/CollectionSchedule";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { toCountMap, buildCoverageRows } from "@/lib/zoneCoverage";

function countBy(Model, match) {
  return Model.aggregate([{ $match: match }, { $group: { _id: "$serviceZone", count: { $sum: 1 } } }]);
}

// Counts only. No name, email or id of any person is ever selected or returned.
export async function getZoneCoverage() {
  await connectDB();
  const [zones, residents, neighborhoods, collectors, schedules, openReports] = await Promise.all([
    ServiceZone.find({ deletedAt: null }).select("name status").lean(),
    countBy(User, { role: "RESIDENT", status: "ACTIVE", deletedAt: null }),
    countBy(Neighborhood, { status: "ACTIVE", deletedAt: null }),
    countBy(User, { role: "COLLECTOR", status: "ACTIVE", deletedAt: null }),
    countBy(CollectionSchedule, { status: "CONFIRMED" }),
    countBy(WasteReport, { deletedAt: null, status: { $nin: CLOSED_STATUSES } }),
  ]);

  const residentMap = toCountMap(residents);
  const totalResidents = Object.values(residentMap).reduce((sum, n) => sum + n, 0);

  return {
    rows: buildCoverageRows(zones, {
      residents: residentMap,
      neighborhoods: toCountMap(neighborhoods),
      collectors: toCountMap(collectors),
      schedules: toCountMap(schedules),
      openReports: toCountMap(openReports),
    }),
    residentsWithoutZone: residentMap.none || 0,
    totalResidents: totalResidents,
  };
}
`);

write("app/admin/(panel)/households/page.js", `
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getZoneCoverage } from "@/services/zoneCoverage";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Households by Zone | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminHouseholdsPage() {
  await requirePermission("users.read");

  let data = null;
  let loadError = false;
  try {
    data = await getZoneCoverage();
  } catch (err) {
    console.error("Load zone coverage failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Households by Zone</h1>
      <p className="mt-1 text-sm text-gray-600">
        This page shows counts only. A household here means an active resident who chose a service zone. Full household
        records with addresses or family members do not exist yet, and no resident is named on this page. Only active
        residents are counted.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Coverage could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}

      {data && (
        <p className="mt-3 text-sm text-gray-800">
          Active residents: {data.totalResidents}. Residents who have not chosen a zone: {data.residentsWithoutZone}.
        </p>
      )}

      {data && data.rows.length === 0 && (
        <div className="mt-4">
          <EmptyState>
            No zones exist yet.{" "}
            <Link href="/admin/zones" className="font-semibold text-emerald-800 underline">Create a zone</Link>
          </EmptyState>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Residents</th>
                <th scope="col" className="py-2 pr-4">Neighborhoods</th>
                <th scope="col" className="py-2 pr-4">Active collectors</th>
                <th scope="col" className="py-2 pr-4">Confirmed schedules</th>
                <th scope="col" className="py-2 pr-4">Open reports</th>
                <th scope="col" className="py-2">Gaps</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} label={ZONE_STATUS_LABELS[r.status]} />
                  </td>
                  <td className="py-2 pr-4">{r.residents}</td>
                  <td className="py-2 pr-4">{r.neighborhoods}</td>
                  <td className="py-2 pr-4">{r.collectors}</td>
                  <td className="py-2 pr-4">{r.schedules}</td>
                  <td className="py-2 pr-4">{r.openReports}</td>
                  <td className="py-2">
                    {r.gaps.length === 0 ? (
                      <span className="text-gray-500">None</span>
                    ) : (
                      <ul className="space-y-1 text-amber-900">
                        {r.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </td>
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

write("tests/unit/zoneCoverage.test.js", `
import { describe, it, expect } from "vitest";
import { toCountMap, coverageGaps, buildCoverageRows } from "@/lib/zoneCoverage";

describe("toCountMap", () => {
  it("turns grouped rows into a map and keeps rows without a zone under none", () => {
    const map = toCountMap([
      { _id: "a", count: 2 },
      { _id: null, count: 3 },
      { _id: "b", count: 1 },
    ]);
    expect(map).toEqual({ a: 2, none: 3, b: 1 });
  });

  it("adds counts that share a key and ignores bad counts", () => {
    expect(toCountMap([{ _id: "a", count: 1 }, { _id: "a", count: 4 }, { _id: "b", count: "x" }])).toEqual({
      a: 5,
      b: 0,
    });
  });

  it("copes with empty or missing input", () => {
    expect(toCountMap([])).toEqual({});
    expect(toCountMap(undefined)).toEqual({});
    expect(toCountMap([null])).toEqual({ none: 0 });
  });
});

describe("coverageGaps", () => {
  it("reports a missing collector and a missing schedule on an active zone", () => {
    expect(coverageGaps({ status: "ACTIVE", collectors: 0, schedules: 0 })).toEqual([
      "No active collector",
      "No confirmed schedule",
    ]);
    expect(coverageGaps({ status: "ACTIVE", collectors: 2, schedules: 0 })).toEqual(["No confirmed schedule"]);
    expect(coverageGaps({ status: "ACTIVE", collectors: 0, schedules: 1 })).toEqual(["No active collector"]);
  });

  it("reports nothing for a covered zone, an inactive zone or a missing row", () => {
    expect(coverageGaps({ status: "ACTIVE", collectors: 1, schedules: 1 })).toEqual([]);
    expect(coverageGaps({ status: "INACTIVE", collectors: 0, schedules: 0 })).toEqual([]);
    expect(coverageGaps(null)).toEqual([]);
  });
});

describe("buildCoverageRows", () => {
  it("builds one row per zone, sorted by name, with zero for missing counts", () => {
    const rows = buildCoverageRows(
      [
        { _id: "b", name: "Zone B", status: "ACTIVE" },
        { _id: "a", name: "Zone A", status: "INACTIVE" },
      ],
      {
        residents: { b: 4 },
        neighborhoods: { b: 2 },
        collectors: { b: 1 },
        schedules: { b: 3 },
        openReports: {},
      }
    );
    expect(rows.map((r) => r.name)).toEqual(["Zone A", "Zone B"]);
    expect(rows[0]).toEqual({
      id: "a",
      name: "Zone A",
      status: "INACTIVE",
      residents: 0,
      neighborhoods: 0,
      collectors: 0,
      schedules: 0,
      openReports: 0,
      gaps: [],
    });
    expect(rows[1].residents).toBe(4);
    expect(rows[1].gaps).toEqual([]);
  });

  it("copes with missing input", () => {
    expect(buildCoverageRows(undefined, undefined)).toEqual([]);
    expect(buildCoverageRows([{ _id: "a", name: "Zone A", status: "ACTIVE" }], undefined)[0].gaps).toEqual([
      "No active collector",
      "No confirmed schedule",
    ]);
  });
});
`);

write("tests/integration/zoneCoverage.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { getZoneCoverage } from "@/services/zoneCoverage";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import Neighborhood from "@/models/Neighborhood";
import CollectionSchedule from "@/models/CollectionSchedule";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function rowOf(data, name) {
  return data.rows.find((r) => r.name === name);
}

describe("getZoneCoverage", () => {
  it("returns empty results on an empty database", async () => {
    expect(await getZoneCoverage()).toEqual({ rows: [], residentsWithoutZone: 0, totalResidents: 0 });
  });

  it("counts active residents per zone and those without a zone, and skips suspended ones", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await makeUser({ serviceZone: a._id });
    await makeUser({ serviceZone: a._id });
    await makeUser({ serviceZone: b._id });
    await makeUser();
    await makeUser({ serviceZone: a._id, status: "SUSPENDED" });
    await makeUser({ role: "COLLECTOR", serviceZone: a._id });

    const data = await getZoneCoverage();
    expect(rowOf(data, "Zone A").residents).toBe(2);
    expect(rowOf(data, "Zone B").residents).toBe(1);
    expect(data.residentsWithoutZone).toBe(1);
    expect(data.totalResidents).toBe(4);
  });

  it("counts active neighborhoods, active collectors and confirmed schedules only", async () => {
    const a = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: a._id });
    await makeUser({ role: "COLLECTOR", serviceZone: a._id, status: "SUSPENDED" });
    await Neighborhood.create({ serviceZone: a._id, name: "North", nameKey: "north", status: "ACTIVE" });
    await Neighborhood.create({ serviceZone: a._id, name: "South", nameKey: "south", status: "INACTIVE" });
    const base = { serviceZone: a._id, collector: collector._id, weekday: 1, startTime: "08:00", endTime: "10:00" };
    await CollectionSchedule.create(Object.assign({}, base, { status: "CONFIRMED" }));
    await CollectionSchedule.create(Object.assign({}, base, { weekday: 2, status: "DRAFT" }));
    await CollectionSchedule.create(Object.assign({}, base, { weekday: 3, status: "CANCELLED" }));

    const row = rowOf(await getZoneCoverage(), "Zone A");
    expect(row.neighborhoods).toBe(1);
    expect(row.collectors).toBe(1);
    expect(row.schedules).toBe(1);
    expect(row.gaps).toEqual([]);
  });

  it("counts open reports only and not finished ones", async () => {
    const a = await makeZone("Zone A");
    const resident = await makeUser();
    for (const status of ["SUBMITTED", "ASSIGNED", "COLLECTED", "REJECTED"]) {
      const r = await makeReport(resident._id, newId(), status);
      await WasteReport.updateOne({ _id: r._id }, { $set: { serviceZone: a._id } });
    }
    const gone = await makeReport(resident._id, newId(), "SUBMITTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { serviceZone: a._id, deletedAt: new Date() } });

    expect(rowOf(await getZoneCoverage(), "Zone A").openReports).toBe(2);
  });

  it("marks gaps on an active zone and none on an inactive zone", async () => {
    await makeZone("Zone A");
    await makeZone("Zone B", { status: "INACTIVE" });
    const data = await getZoneCoverage();
    expect(rowOf(data, "Zone A").gaps).toEqual(["No active collector", "No confirmed schedule"]);
    expect(rowOf(data, "Zone B").gaps).toEqual([]);
  });

  it("never returns a name, an email or an id of a resident", async () => {
    const a = await makeZone("Zone A");
    const resident = await makeUser({ serviceZone: a._id });
    const text = JSON.stringify(await getZoneCoverage());
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
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
  if (f.startsWith("app/") &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/households/page.js") {
    if (!src.includes('requirePermission("users.read")')) problems.push("missing page permission check");
    if (/useActionState|updateOne|findOneAndUpdate/.test(src)) problems.push("page must be read-only");
  }
  if (f === "services/zoneCoverage.js") {
    if (/email|passwordHash/.test(src)) problems.push("service must never select personal data");
    if (/updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|create\(/.test(src)) {
      problems.push("service must be read-only");
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");