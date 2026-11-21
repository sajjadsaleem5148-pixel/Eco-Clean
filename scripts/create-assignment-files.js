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
  "models/WasteReport.js",
  "models/ServiceZone.js",
  "models/User.js",
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
if (!fs.readFileSync("models/WasteReport.js", "utf8").includes("assignedCollector")) {
  console.error("FAILED: models/WasteReport.js has no assignedCollector field. Run create-collector-files.js first.");
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

write("lib/assignmentSummary.js", `
// Statuses of a job that a collector currently holds.
export const ACTIVE_JOB_STATUSES = ["ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"];

const HOUR_MS = 60 * 60 * 1000;

// Whole hours since a date. Returns null when the date is missing or not valid.
export function hoursSince(date, now) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const current = (now || new Date()).getTime();
  return Math.max(0, Math.floor((current - then.getTime()) / HOUR_MS));
}

// items: [{ collectorId, collectorName, status }]. Jobs without a collector id are skipped.
// Result: one row per collector, the busiest first, then by name.
export function summarizeByCollector(items) {
  const rows = {};
  (items || []).forEach((item) => {
    if (!item || !item.collectorId) return;
    if (!ACTIVE_JOB_STATUSES.includes(item.status)) return;
    if (!rows[item.collectorId]) {
      rows[item.collectorId] = {
        collectorId: item.collectorId,
        name: item.collectorName || "Unknown collector",
        total: 0,
        ASSIGNED: 0,
        ACCEPTED: 0,
        ON_THE_WAY: 0,
        ARRIVED: 0,
      };
    }
    rows[item.collectorId][item.status] += 1;
    rows[item.collectorId].total += 1;
  });
  return Object.values(rows).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
`);

write("services/assignments.js", `
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";
import "@/models/User";
import { ACTIVE_JOB_STATUSES, summarizeByCollector, hoursSince } from "@/lib/assignmentSummary";

const MAX_ACTIVE_JOBS = 500;

// Read-only. The person who made the report is never selected, so no personal data of that person can reach the page.
export async function listActiveAssignments(options) {
  const opts = options || {};
  const now = opts.now || new Date();
  await connectDB();

  const [reports, waitingForCollector] = await Promise.all([
    WasteReport.find({
      deletedAt: null,
      status: { $in: ACTIVE_JOB_STATUSES },
      assignedCollector: { $ne: null },
    })
      .sort({ assignedAt: 1, createdAt: 1 })
      .limit(MAX_ACTIVE_JOBS)
      .populate("serviceZone", "name")
      .populate("assignedCollector", "name")
      .select("reportId status serviceZone assignedCollector assignedAt")
      .lean(),
    WasteReport.countDocuments({ deletedAt: null, status: "VERIFIED" }),
  ]);

  const all = reports.map((r) => ({
    reportId: r.reportId,
    status: r.status,
    zoneName: r.serviceZone ? r.serviceZone.name : "-",
    collectorId: r.assignedCollector ? r.assignedCollector._id.toString() : "",
    collectorName: r.assignedCollector ? r.assignedCollector.name : "Unknown collector",
    assignedAt: r.assignedAt || null,
    hoursWaiting: hoursSince(r.assignedAt, now),
  }));

  const summary = summarizeByCollector(all);
  const items = opts.collectorId ? all.filter((i) => i.collectorId === String(opts.collectorId)) : all;
  items.sort((a, b) => (b.hoursWaiting === null ? -1 : b.hoursWaiting) - (a.hoursWaiting === null ? -1 : a.hoursWaiting));

  return { items: items, summary: summary, waitingForCollector: waitingForCollector };
}
`);

write("app/admin/(panel)/assignments/page.js", `
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listActiveAssignments } from "@/services/assignments";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Assignments | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminAssignmentsPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const raw = typeof sp?.collector === "string" ? sp.collector : "";
  const collectorId = /^[a-f\\d]{24}$/i.test(raw) ? raw : "";

  let data = null;
  let loadError = false;
  try {
    data = await listActiveAssignments({ collectorId: collectorId });
  } catch (err) {
    console.error("Load assignments failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Active jobs that a collector currently holds. Finished jobs are not listed here. This page is read-only: to
          assign or reassign a collector, open the report. At most 500 active jobs are checked.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Assignments could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && (
          <p className="mt-3 text-sm text-gray-800">
            Verified reports still waiting for a collector:{" "}
            <Link href="/admin/reports?status=VERIFIED" className="font-semibold text-emerald-800 underline">
              {data.waitingForCollector}
            </Link>
          </p>
        )}
      </section>

      {data && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Jobs per collector</h2>
          {data.summary.length === 0 ? (
            <div className="mt-3">
              <EmptyState>No collector holds an active job right now.</EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Collector</th>
                    <th scope="col" className="py-2 pr-4">Assigned</th>
                    <th scope="col" className="py-2 pr-4">Accepted</th>
                    <th scope="col" className="py-2 pr-4">On the way</th>
                    <th scope="col" className="py-2 pr-4">Arrived</th>
                    <th scope="col" className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((s) => (
                    <tr key={s.collectorId} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium">{s.name}</td>
                      <td className="py-2 pr-4">{s.ASSIGNED}</td>
                      <td className="py-2 pr-4">{s.ACCEPTED}</td>
                      <td className="py-2 pr-4">{s.ON_THE_WAY}</td>
                      <td className="py-2 pr-4">{s.ARRIVED}</td>
                      <td className="py-2 font-semibold">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {data && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Active jobs</h2>

          <form action="/admin/assignments" method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="collector" className="mb-1 block text-sm font-medium">Collector</label>
              <select id="collector" name="collector" defaultValue={collectorId}
                className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All collectors</option>
                {data.summary.map((s) => (
                  <option key={s.collectorId} value={s.collectorId}>{s.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
              Apply
            </button>
            {collectorId && (
              <Link href="/admin/assignments" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">
                Clear filter
              </Link>
            )}
          </form>

          {data.items.length === 0 ? (
            <div className="mt-4">
              <EmptyState>No active jobs match this filter.</EmptyState>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Report</th>
                    <th scope="col" className="py-2 pr-4">Zone</th>
                    <th scope="col" className="py-2 pr-4">Collector</th>
                    <th scope="col" className="py-2 pr-4">Status</th>
                    <th scope="col" className="py-2 pr-4">Assigned</th>
                    <th scope="col" className="py-2">Hours since assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.reportId} className="border-b border-gray-100">
                      <td className="py-2 pr-4">
                        <Link href={"/admin/reports/" + i.reportId} className="font-semibold text-emerald-800 underline">
                          {i.reportId}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{i.zoneName}</td>
                      <td className="py-2 pr-4">{i.collectorName}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={i.status} label={STATUS_LABELS[i.status]} />
                      </td>
                      <td className="py-2 pr-4">{i.assignedAt ? formatDateTime(i.assignedAt) : "-"}</td>
                      <td className="py-2">{i.hoursWaiting === null ? "-" : i.hoursWaiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
`);

write("tests/unit/assignmentSummary.test.js", `
import { describe, it, expect } from "vitest";
import { ACTIVE_JOB_STATUSES, summarizeByCollector, hoursSince } from "@/lib/assignmentSummary";

describe("hoursSince", () => {
  const NOW = new Date("2026-11-20T12:00:00Z");

  it("counts whole hours", () => {
    expect(hoursSince(new Date("2026-11-20T09:30:00Z"), NOW)).toBe(2);
    expect(hoursSince(new Date("2026-11-19T12:00:00Z"), NOW)).toBe(24);
  });

  it("never goes below zero", () => {
    expect(hoursSince(new Date("2026-11-21T12:00:00Z"), NOW)).toBe(0);
  });

  it("returns null for a missing or bad date", () => {
    expect(hoursSince(undefined, NOW)).toBeNull();
    expect(hoursSince(null, NOW)).toBeNull();
    expect(hoursSince("not a date", NOW)).toBeNull();
  });
});

describe("summarizeByCollector", () => {
  it("lists the four active job statuses", () => {
    expect(ACTIVE_JOB_STATUSES).toEqual(["ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"]);
  });

  it("counts jobs per collector and per status", () => {
    const rows = summarizeByCollector([
      { collectorId: "a", collectorName: "Ali", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "ARRIVED" },
      { collectorId: "b", collectorName: "Bilal", status: "ACCEPTED" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      collectorId: "a",
      name: "Ali",
      total: 2,
      ASSIGNED: 1,
      ACCEPTED: 0,
      ON_THE_WAY: 0,
      ARRIVED: 1,
    });
    expect(rows[1].total).toBe(1);
  });

  it("puts the busiest collector first, then sorts by name", () => {
    const rows = summarizeByCollector([
      { collectorId: "z", collectorName: "Zara", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "ASSIGNED" },
      { collectorId: "m", collectorName: "Mona", status: "ASSIGNED" },
      { collectorId: "m", collectorName: "Mona", status: "ACCEPTED" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Mona", "Ali", "Zara"]);
  });

  it("skips jobs without a collector and jobs that are not active", () => {
    const rows = summarizeByCollector([
      { collectorId: "", collectorName: "Nobody", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "COLLECTED" },
      { collectorId: "a", collectorName: "Ali", status: "VERIFIED" },
      null,
    ]);
    expect(rows).toEqual([]);
  });

  it("copes with empty or missing input", () => {
    expect(summarizeByCollector([])).toEqual([]);
    expect(summarizeByCollector(undefined)).toEqual([]);
  });
});
`);

write("tests/integration/assignments.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listActiveAssignments } from "@/services/assignments";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

const HOUR = 60 * 60 * 1000;

async function job(resident, collector, status, hoursAgo, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        { assignedCollector: collector._id, assignedAt: new Date(Date.now() - hoursAgo * HOUR) },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listActiveAssignments", () => {
  it("lists only active jobs that have a collector", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const a = await job(resident, collector, "ASSIGNED", 5);
    const b = await job(resident, collector, "ARRIVED", 2);
    await job(resident, collector, "COLLECTED", 9);
    await job(resident, collector, "UNABLE_TO_COLLECT", 9);
    await makeReport(resident._id, newId(), "VERIFIED");
    const gone = await job(resident, collector, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const result = await listActiveAssignments();
    expect(result.items.map((i) => i.reportId).sort()).toEqual([a.reportId, b.reportId].sort());
  });

  it("puts the longest wait first and reports the hours", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const recent = await job(resident, collector, "ASSIGNED", 1);
    const old = await job(resident, collector, "ASSIGNED", 30);
    const result = await listActiveAssignments();
    expect(result.items.map((i) => i.reportId)).toEqual([old.reportId, recent.reportId]);
    expect(result.items[0].hoursWaiting).toBeGreaterThanOrEqual(29);
    expect(result.items[0].hoursWaiting).toBeLessThanOrEqual(31);
  });

  it("summarises per collector and can filter the list without changing the summary", async () => {
    const resident = await makeUser();
    const ali = await makeUser({ role: "COLLECTOR", name: "Ali Collector" });
    const bilal = await makeUser({ role: "COLLECTOR", name: "Bilal Collector" });
    await job(resident, ali, "ASSIGNED", 3);
    await job(resident, ali, "ACCEPTED", 3);
    await job(resident, bilal, "ON_THE_WAY", 3);

    const all = await listActiveAssignments();
    expect(all.summary.map((s) => s.name)).toEqual(["Ali Collector", "Bilal Collector"]);
    expect(all.summary[0].total).toBe(2);

    const only = await listActiveAssignments({ collectorId: String(bilal._id) });
    expect(only.items).toHaveLength(1);
    expect(only.items[0].collectorName).toBe("Bilal Collector");
    expect(only.summary).toHaveLength(2);
  });

  it("counts verified reports that still wait for a collector", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "VERIFIED");
    await makeReport(resident._id, newId(), "VERIFIED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const result = await listActiveAssignments();
    expect(result.waitingForCollector).toBe(2);
    expect(result.items).toEqual([]);
  });

  it("shows the zone name and copes with a missing assignment time", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const zone = await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    const r = await job(resident, collector, "ASSIGNED", 4, { serviceZone: zone._id });
    await WasteReport.updateOne({ _id: r._id }, { $unset: { assignedAt: "" } });

    const result = await listActiveAssignments();
    expect(result.items[0].zoneName).toBe("Zone A");
    expect(result.items[0].assignedAt).toBeNull();
    expect(result.items[0].hoursWaiting).toBeNull();
  });

  it("never returns anything about the resident", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    await job(resident, collector, "ASSIGNED", 2);
    const text = JSON.stringify(await listActiveAssignments());
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });

  it("returns empty results on an empty database", async () => {
    expect(await listActiveAssignments()).toEqual({ items: [], summary: [], waitingForCollector: 0 });
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
  if (f === "app/admin/(panel)/assignments/page.js") {
    if (!src.includes('requirePermission("collections.manage")')) problems.push("missing page permission check");
    if (/useActionState|updateOne|findOneAndUpdate/.test(src)) problems.push("page must be read-only");
  }
  if (f === "services/assignments.js") {
    if (/reporter/.test(src)) problems.push("service must never select the person who made the report");
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