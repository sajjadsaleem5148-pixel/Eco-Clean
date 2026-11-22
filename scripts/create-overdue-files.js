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
  "lib/permissions/roles.js",
  "lib/reportStatus.js",
  "models/WasteReport.js",
  "models/ServiceZone.js",
  "models/User.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
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

write("lib/overdue.js", `
// A report counts as overdue when it was verified, is still not collected, and more time has passed
// than the zone's collection target allows. This is an estimate, not a confirmed missed pickup.
export const OVERDUE_STATUSES = ["VERIFIED", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function verifiedAtOf(history) {
  if (!Array.isArray(history)) return null;
  const entry = history.find((h) => h && h.status === "VERIFIED" && h.at);
  if (!entry) return null;
  const date = new Date(entry.at);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Returns null when the report is not overdue.
export function overdueInfo(report, zoneDays, now) {
  const current = now || new Date();
  if (!report || !OVERDUE_STATUSES.includes(report.status)) return null;
  if (typeof zoneDays !== "number" || !(zoneDays >= 1)) return null;
  const verifiedAt = verifiedAtOf(report.statusHistory);
  if (!verifiedAt) return null;

  const dueAt = new Date(verifiedAt.getTime() + zoneDays * DAY_MS);
  if (current.getTime() <= dueAt.getTime()) return null;

  return {
    verifiedAt: verifiedAt,
    dueAt: dueAt,
    hoursLate: Math.floor((current.getTime() - dueAt.getTime()) / HOUR_MS),
  };
}
`);

write("services/overdue.js", `
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";
import "@/models/User";
import { OVERDUE_STATUSES, overdueInfo } from "@/lib/overdue";

const MAX_OPEN_REPORTS = 500;

// Read-only. It never selects the resident, so no personal data of the reporter can reach the page.
export async function listOverdue(now) {
  await connectDB();
  const current = now || new Date();
  const reports = await WasteReport.find({ deletedAt: null, status: { $in: OVERDUE_STATUSES } })
    .sort({ createdAt: 1 })
    .limit(MAX_OPEN_REPORTS)
    .populate("serviceZone", "name targetCollectionEveryDays")
    .populate("assignedCollector", "name")
    .select("reportId status serviceZone assignedCollector statusHistory")
    .lean();

  const items = [];
  reports.forEach((r) => {
    const zoneDays = r.serviceZone ? r.serviceZone.targetCollectionEveryDays : null;
    const info = overdueInfo(r, zoneDays, current);
    if (!info) return;
    items.push({
      reportId: r.reportId,
      status: r.status,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      collectorName: r.assignedCollector ? r.assignedCollector.name : "",
      verifiedAt: info.verifiedAt,
      dueAt: info.dueAt,
      hoursLate: info.hoursLate,
    });
  });
  items.sort((a, b) => b.hoursLate - a.hoursLate);
  return items;
}

export async function listUnable(limit) {
  await connectDB();
  const reports = await WasteReport.find({ deletedAt: null, status: "UNABLE_TO_COLLECT" })
    .sort({ updatedAt: -1 })
    .limit(limit || 50)
    .populate("serviceZone", "name")
    .populate("assignedCollector", "name")
    .select("reportId serviceZone assignedCollector statusHistory")
    .lean();

  return reports.map((r) => {
    const history = Array.isArray(r.statusHistory) ? r.statusHistory : [];
    const entry = history.slice().reverse().find((h) => h.status === "UNABLE_TO_COLLECT");
    return {
      reportId: r.reportId,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      collectorName: r.assignedCollector ? r.assignedCollector.name : "",
      recordedAt: entry ? entry.at : null,
      note: entry && entry.note ? entry.note : "",
    };
  });
}
`);

write("app/admin/(panel)/missed-pickups/page.js", `
import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { listOverdue, listUnable } from "@/services/overdue";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Missed Pickups | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminMissedPickupsPage({ searchParams }) {
  const user = await requirePermission("reports.read");
  const canSeeCollector = hasPermission(user.role, "collections.manage");
  const sp = await searchParams;
  const view = sp && sp.view === "unable" ? "unable" : "overdue";

  let items = [];
  let loadError = false;
  try {
    items = view === "unable" ? await listUnable() : await listOverdue();
  } catch (err) {
    console.error("Load missed pickups failed:", err.message);
    loadError = true;
  }

  const tabs = [
    { label: "Overdue reports", href: "/admin/missed-pickups", active: view === "overdue" },
    { label: "Unable to collect", href: "/admin/missed-pickups?view=unable", active: view === "unable" },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Missed Pickups</h1>
      <p className="mt-1 text-sm text-gray-600">
        A report is listed as overdue when it was verified, is still not collected, and more time has passed than its
        zone&apos;s collection target. This is an estimate based on the target, not a confirmed missed pickup. Holidays
        and service interruptions are not taken into account. This page is read-only.
      </p>

      <div className="mt-4">
        <FilterTabs label="Missed pickups view" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>This list could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}

      {!loadError && items.length === 0 && (
        <div className="mt-4">
          <EmptyState>
            {view === "unable" ? "No pickups were recorded as unable to collect." : "No reports are overdue right now."}
          </EmptyState>
        </div>
      )}

      {items.length > 0 && view === "overdue" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                {canSeeCollector && <th scope="col" className="py-2 pr-4">Collector</th>}
                <th scope="col" className="py-2 pr-4">Verified</th>
                <th scope="col" className="py-2 pr-4">Target date</th>
                <th scope="col" className="py-2">Hours late</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.reportId} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/reports/" + r.reportId} className="font-semibold text-emerald-800 underline">
                      {r.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.zoneName}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} label={STATUS_LABELS[r.status]} />
                  </td>
                  {canSeeCollector && <td className="py-2 pr-4">{r.collectorName || "Not assigned"}</td>}
                  <td className="py-2 pr-4">{formatDateTime(r.verifiedAt)}</td>
                  <td className="py-2 pr-4">{formatDateTime(r.dueAt)}</td>
                  <td className="py-2 font-semibold">{r.hoursLate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && view === "unable" && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                {canSeeCollector && <th scope="col" className="py-2 pr-4">Collector</th>}
                <th scope="col" className="py-2 pr-4">Recorded</th>
                <th scope="col" className="py-2">Collector&apos;s note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.reportId} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/reports/" + r.reportId} className="font-semibold text-emerald-800 underline">
                      {r.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.zoneName}</td>
                  {canSeeCollector && <td className="py-2 pr-4">{r.collectorName || "-"}</td>}
                  <td className="py-2 pr-4">{r.recordedAt ? formatDateTime(r.recordedAt) : "-"}</td>
                  <td className="py-2">{r.note || "-"}</td>
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

write("tests/unit/overdue.test.js", `
import { describe, it, expect } from "vitest";
import { OVERDUE_STATUSES, verifiedAtOf, overdueInfo } from "@/lib/overdue";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T12:00:00Z");

function report(status, verifiedDaysAgo) {
  return {
    status: status,
    statusHistory: [
      { status: "SUBMITTED", at: new Date(NOW.getTime() - 10 * DAY) },
      { status: "VERIFIED", at: new Date(NOW.getTime() - verifiedDaysAgo * DAY) },
    ],
  };
}

describe("verifiedAtOf", () => {
  it("finds the time of verification", () => {
    expect(verifiedAtOf(report("VERIFIED", 2).statusHistory).getTime()).toBe(NOW.getTime() - 2 * DAY);
  });

  it("returns null when there is no verification or the history is bad", () => {
    expect(verifiedAtOf([{ status: "SUBMITTED", at: new Date() }])).toBeNull();
    expect(verifiedAtOf(undefined)).toBeNull();
    expect(verifiedAtOf([{ status: "VERIFIED", at: "not a date" }])).toBeNull();
  });
});

describe("overdueInfo", () => {
  it("is overdue when the zone target has passed", () => {
    const info = overdueInfo(report("ASSIGNED", 4), 3, NOW);
    expect(info.hoursLate).toBe(24);
    expect(info.dueAt.getTime()).toBe(NOW.getTime() - 1 * DAY);
  });

  it("is not overdue before the target date, or exactly on it", () => {
    expect(overdueInfo(report("VERIFIED", 2), 3, NOW)).toBeNull();
    expect(overdueInfo(report("VERIFIED", 3), 3, NOW)).toBeNull();
  });

  it("uses the zone's own target", () => {
    expect(overdueInfo(report("VERIFIED", 2), 1, NOW)).not.toBeNull();
    expect(overdueInfo(report("VERIFIED", 2), 7, NOW)).toBeNull();
  });

  it("ignores finished reports and reports that are not verified yet", () => {
    ["COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED", "SUBMITTED", "UNDER_REVIEW"].forEach((s) => {
      expect(overdueInfo(report(s, 30), 3, NOW)).toBeNull();
    });
    expect(OVERDUE_STATUSES).toEqual(["VERIFIED", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"]);
  });

  it("ignores a missing verification time and a bad zone target", () => {
    expect(overdueInfo({ status: "ASSIGNED", statusHistory: [] }, 3, NOW)).toBeNull();
    expect(overdueInfo(report("ASSIGNED", 9), 0, NOW)).toBeNull();
    expect(overdueInfo(report("ASSIGNED", 9), undefined, NOW)).toBeNull();
    expect(overdueInfo(null, 3, NOW)).toBeNull();
  });
});
`);

write("tests/integration/overdue.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listOverdue, listUnable } from "@/services/overdue";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

const DAY = 24 * 60 * 60 * 1000;

function makeZone(name, days) {
  return ServiceZone.create({
    name: name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    targetCollectionEveryDays: days,
  });
}

async function verifiedReport(resident, zone, status, daysAgo, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        {
          serviceZone: zone._id,
          statusHistory: [
            { status: "SUBMITTED", at: new Date(Date.now() - (daysAgo + 1) * DAY) },
            { status: "VERIFIED", at: new Date(Date.now() - daysAgo * DAY) },
          ],
        },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listOverdue", () => {
  it("lists only open verified reports that passed the zone target", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const late = await verifiedReport(resident, zone, "ASSIGNED", 4);
    await verifiedReport(resident, zone, "VERIFIED", 2);
    await verifiedReport(resident, zone, "COLLECTED", 10);
    await verifiedReport(resident, zone, "REJECTED", 10);

    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([late.reportId]);
    expect(items[0].hoursLate).toBeGreaterThanOrEqual(23);
    expect(items[0].hoursLate).toBeLessThanOrEqual(25);
    expect(items[0].zoneName).toBe("Zone A");
  });

  it("uses each zone's own target", async () => {
    const resident = await makeUser();
    const fast = await makeZone("Fast Zone", 1);
    const slow = await makeZone("Slow Zone", 7);
    const a = await verifiedReport(resident, fast, "VERIFIED", 2);
    await verifiedReport(resident, slow, "VERIFIED", 2);
    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([a.reportId]);
  });

  it("puts the most late report first", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const a = await verifiedReport(resident, zone, "VERIFIED", 5);
    const b = await verifiedReport(resident, zone, "VERIFIED", 9);
    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([b.reportId, a.reportId]);
  });

  it("ignores reports without a verification entry and deleted reports", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const none = await verifiedReport(resident, zone, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: none._id }, { $set: { statusHistory: [] } });
    const gone = await verifiedReport(resident, zone, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });
    expect(await listOverdue()).toEqual([]);
  });

  it("shows the collector's name but nothing about the resident", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const zone = await makeZone("Zone A", 3);
    await verifiedReport(resident, zone, "ASSIGNED", 6, { assignedCollector: collector._id });

    const items = await listOverdue();
    expect(items).toHaveLength(1);
    expect(items[0].collectorName).toBe(collector.name);
    const text = JSON.stringify(items);
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });
});

describe("listUnable", () => {
  it("lists only unable-to-collect reports with the collector's note", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const unable = await verifiedReport(resident, zone, "UNABLE_TO_COLLECT", 2);
    await WasteReport.updateOne(
      { _id: unable._id },
      {
        $push: {
          statusHistory: { status: "UNABLE_TO_COLLECT", at: new Date(), note: "The road was blocked" },
        },
      }
    );
    await verifiedReport(resident, zone, "COLLECTED", 2);

    const items = await listUnable();
    expect(items).toHaveLength(1);
    expect(items[0].reportId).toBe(unable.reportId);
    expect(items[0].note).toBe("The road was blocked");
    expect(items[0].zoneName).toBe("Zone A");
  });

  it("returns an empty list when nothing was recorded", async () => {
    expect(await listUnable()).toEqual([]);
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
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/missed-pickups/page.js") {
    if (!src.includes('requirePermission("reports.read")')) problems.push("missing page permission check");
    if (/updateOne|deleteOne|findOneAndUpdate|useActionState/.test(src)) problems.push("page must be read-only");
  }
  if (f === "services/overdue.js") {
    if (/reporter/.test(src.replace(/\/\/.*$/gm, ""))) problems.push("service must never select the reporter");
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