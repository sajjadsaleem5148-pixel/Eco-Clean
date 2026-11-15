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
  "lib/auth/session.js",
  "lib/permissions/roles.js",
  "lib/audit/log.js",
  "lib/security/rateLimit.js",
  "lib/reportStatus.js",
  "lib/complaintStatus.js",
  "lib/rewardStatus.js",
  "lib/points/labels.js",
  "models/WasteReport.js",
  "models/Complaint.js",
  "models/GreenPointsTransaction.js",
  "models/RewardOrder.js",
  "models/ServiceZone.js",
  "models/AuditLog.js",
  "components/dashboard/StatCard.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
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

write("lib/csv.js", `
// Turns one value into one safe CSV cell.
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  // A cell that starts with one of these characters can run as a formula in Excel or Sheets.
  if (/^[=+\\-@\\t\\r]/.test(text)) text = "'" + text;
  if (/[",\\r\\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

// columns: [{ key, label }]   rows: [{ [key]: value }]
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  });
  return lines.join("\\r\\n") + "\\r\\n";
}
`);

write("lib/analyticsRange.js", `
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;
const DATE_PATTERN = /^\\d{4}-\\d{2}-\\d{2}$/;

function parseDay(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const d = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

// Both dates are inclusive UTC days. Without dates the range is the last 30 days.
export function parseRange(fromValue, toValue, now) {
  const current = now || new Date();
  const toStr = toValue ? toValue : current.toISOString().slice(0, 10);
  const to = parseDay(toStr);
  if (!to) return { error: "The end date is not a valid date. Use YYYY-MM-DD." };

  const fromStr = fromValue ? fromValue : new Date(to.getTime() - 29 * DAY_MS).toISOString().slice(0, 10);
  const from = parseDay(fromStr);
  if (!from) return { error: "The start date is not a valid date. Use YYYY-MM-DD." };

  if (from.getTime() > to.getTime()) return { error: "The start date must not be after the end date." };

  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    return { error: "The date range is too long. The maximum is " + MAX_RANGE_DAYS + " days." };
  }

  return { fromStr, toStr, from, toExclusive: new Date(to.getTime() + DAY_MS), days };
}
`);

write("lib/analyticsDatasets.js", `
// Every dataset is aggregate counts or totals only. No names, emails, phone numbers or addresses.
export const DATASETS = {
  "reports-by-status": {
    label: "Garbage reports by status",
    description: "Number of garbage reports created in the range, grouped by current status.",
    zone: true,
    columns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Reports" },
    ],
  },
  "reports-by-day": {
    label: "Garbage reports per day",
    description: "Number of garbage reports created on each UTC day.",
    zone: true,
    columns: [
      { key: "day", label: "Day" },
      { key: "count", label: "Reports" },
    ],
  },
  "complaints-by-status": {
    label: "Complaints by status",
    description: "Number of complaints created in the range, grouped by current status.",
    zone: true,
    columns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Complaints" },
    ],
  },
  "points-by-type": {
    label: "Green Points by transaction type",
    description: "Number of ledger entries and the total signed points for each type.",
    zone: false,
    columns: [
      { key: "type", label: "Type" },
      { key: "entries", label: "Entries" },
      { key: "points", label: "Points" },
    ],
  },
  "orders-by-status": {
    label: "Reward orders by status",
    description: "Number of reward orders and the points they cost, grouped by current status.",
    zone: false,
    columns: [
      { key: "status", label: "Status" },
      { key: "orders", label: "Orders" },
      { key: "points", label: "Points" },
    ],
  },
};

export const DATASET_KEYS = Object.keys(DATASETS);
`);

write("services/analytics.js", `
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardOrder from "@/models/RewardOrder";

const HOUR_MS = 60 * 60 * 1000;

function dateMatch(range) {
  return { createdAt: { $gte: range.from, $lt: range.toExclusive } };
}

function zoneMatch(zoneId) {
  return zoneId ? { serviceZone: new mongoose.Types.ObjectId(zoneId) } : {};
}

function reportMatch(range, zoneId) {
  return Object.assign({ deletedAt: null }, dateMatch(range), zoneMatch(zoneId));
}

function complaintMatch(range, zoneId) {
  return Object.assign({ deletedAt: null }, dateMatch(range), zoneMatch(zoneId));
}

async function countByStatus(Model, match) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ status: r._id, count: r.count }));
}

async function reportsByDay(range, zoneId) {
  const rows = await WasteReport.aggregate([
    { $match: reportMatch(range, zoneId) },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ day: r._id, count: r.count }));
}

async function pointsByType(range) {
  const rows = await GreenPointsTransaction.aggregate([
    { $match: dateMatch(range) },
    { $group: { _id: "$type", entries: { $sum: 1 }, points: { $sum: "$points" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ type: r._id, entries: r.entries, points: r.points }));
}

async function ordersByStatus(range) {
  const rows = await RewardOrder.aggregate([
    { $match: dateMatch(range) },
    { $group: { _id: "$status", orders: { $sum: 1 }, points: { $sum: "$pointsCost" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ status: r._id, orders: r.orders, points: r.points }));
}

function toHours(rows) {
  if (!rows.length || rows[0].avgMs === null || rows[0].avgMs === undefined) return null;
  return { hours: Math.round((rows[0].avgMs / HOUR_MS) * 10) / 10, count: rows[0].count };
}

// Average time from creation to the first staff decision (verified or rejected).
async function reviewHours(range, zoneId) {
  const rows = await WasteReport.aggregate([
    { $match: reportMatch(range, zoneId) },
    {
      $addFields: {
        decidedAt: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: "$statusHistory",
                  as: "h",
                  cond: { $in: ["$$h.status", ["VERIFIED", "REJECTED"]] },
                },
              },
              as: "h",
              in: "$$h.at",
            },
          },
        },
      },
    },
    { $match: { decidedAt: { $ne: null } } },
    { $group: { _id: null, avgMs: { $avg: { $subtract: ["$decidedAt", "$createdAt"] } }, count: { $sum: 1 } } },
  ]);
  return toHours(rows);
}

// Average time from creation to resolution, for resolved complaints only.
async function resolutionHours(range, zoneId) {
  const rows = await Complaint.aggregate([
    { $match: Object.assign(complaintMatch(range, zoneId), { status: "RESOLVED", resolvedAt: { $ne: null } }) },
    { $group: { _id: null, avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } }, count: { $sum: 1 } } },
  ]);
  return toHours(rows);
}

export async function loadDataset(key, range, zoneId) {
  await connectDB();
  switch (key) {
    case "reports-by-status":
      return countByStatus(WasteReport, reportMatch(range, zoneId));
    case "reports-by-day":
      return reportsByDay(range, zoneId);
    case "complaints-by-status":
      return countByStatus(Complaint, complaintMatch(range, zoneId));
    case "points-by-type":
      return pointsByType(range);
    case "orders-by-status":
      return ordersByStatus(range);
    default:
      throw new Error("Unknown dataset");
  }
}

export async function loadOverview(range, zoneId) {
  await connectDB();
  const [reportsByStatus, byDay, complaintsByStatus, points, orders, review, resolution] = await Promise.all([
    loadDataset("reports-by-status", range, zoneId),
    loadDataset("reports-by-day", range, zoneId),
    loadDataset("complaints-by-status", range, zoneId),
    loadDataset("points-by-type", range, zoneId),
    loadDataset("orders-by-status", range, zoneId),
    reviewHours(range, zoneId),
    resolutionHours(range, zoneId),
  ]);
  return {
    reportsByStatus,
    reportsByDay: byDay,
    complaintsByStatus,
    pointsByType: points,
    ordersByStatus: orders,
    reviewHours: review,
    resolutionHours: resolution,
  };
}
`);

write("components/tables/SimpleTable.js", `
// columns: [{ key, label }]   rows: [{ [key]: value }]
export default function SimpleTable({ columns, rows, caption }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-gray-200 text-gray-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-2 pr-4">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-100">
              {columns.map((c) => (
                <td key={c.key} className="py-2 pr-4">{r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`);

write("app/api/admin/export/route.js", `
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/roles";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS } from "@/lib/analyticsDatasets";
import { toCsv } from "@/lib/csv";
import { loadDataset } from "@/services/analytics";
import { writeAudit } from "@/lib/audit/log";
import { hit, makeKey } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

function plain(status, message) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  // Permission is checked on the server for every request, whatever the page showed.
  const user = await getCurrentUser();
  if (!user) return plain(401, "Please log in.");
  if (!hasPermission(user.role, "analytics.export")) {
    return plain(403, "You do not have permission to export data.");
  }

  const params = new URL(request.url).searchParams;
  const key = params.get("dataset") || "";
  if (!Object.prototype.hasOwnProperty.call(DATASETS, key)) return plain(400, "Unknown dataset.");

  const range = parseRange(params.get("from") || "", params.get("to") || "");
  if (range.error) return plain(400, range.error);

  const zone = params.get("zone") || "";
  if (zone && !/^[a-f\\d]{24}$/i.test(zone)) return plain(400, "Invalid zone.");

  try {
    const limit = await hit(makeKey("export", user.id), 20, 60 * 60);
    if (!limit.ok) return plain(429, "Too many exports. Please try again later.");

    const zoneId = DATASETS[key].zone ? zone : "";
    const rows = await loadDataset(key, range, zoneId);

    await writeAudit({
      actor: user.id,
      action: "export.download",
      targetType: "Export",
      targetId: key,
      metadata: { from: range.fromStr, to: range.toStr, zone: zoneId || "all", rows: rows.length },
    });

    const csv = toCsv(DATASETS[key].columns, rows);
    const filename = key + "_" + range.fromStr + "_to_" + range.toStr + ".csv";
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Export failed:", err.message);
    return plain(500, "The export failed. Please try again.");
  }
}
`);

write("app/admin/(panel)/analytics/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS } from "@/lib/analyticsDatasets";
import { loadOverview } from "@/services/analytics";
import { STATUS_LABELS } from "@/lib/reportStatus";
import { COMPLAINT_STATUS_LABELS } from "@/lib/complaintStatus";
import { ORDER_STATUS_LABELS } from "@/lib/rewardStatus";
import { TYPE_LABELS } from "@/lib/points/labels";
import StatCard from "@/components/dashboard/StatCard";
import SimpleTable from "@/components/tables/SimpleTable";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Analytics | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function label(map, value) {
  return map[value] || value;
}

function hoursText(result) {
  return result ? result.hours + " h (" + result.count + " records)" : null;
}

export default async function AdminAnalyticsPage({ searchParams }) {
  const user = await requirePermission("analytics.read");
  const canExport = hasPermission(user.role, "analytics.export");
  const sp = await searchParams;
  const from = typeof sp?.from === "string" ? sp.from : "";
  const to = typeof sp?.to === "string" ? sp.to : "";
  const zoneRaw = typeof sp?.zone === "string" ? sp.zone : "";
  const zoneId = /^[a-f\\d]{24}$/i.test(zoneRaw) ? zoneRaw : "";
  const range = parseRange(from, to);

  let zones = [];
  let data = null;
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name").lean();
    if (!range.error) data = await loadOverview(range, zoneId);
  } catch (err) {
    console.error("Load analytics failed:", err.message);
    loadError = true;
  }

  function exportHref(key) {
    const q = new URLSearchParams({ dataset: key, from: range.fromStr, to: range.toStr, zone: zoneId });
    return "/api/admin/export?" + q.toString();
  }

  const sections = data
    ? [
        {
          key: "reports-by-status",
          rows: data.reportsByStatus.map((r) => ({ status: label(STATUS_LABELS, r.status), count: r.count })),
        },
        { key: "reports-by-day", rows: data.reportsByDay },
        {
          key: "complaints-by-status",
          rows: data.complaintsByStatus.map((r) => ({ status: label(COMPLAINT_STATUS_LABELS, r.status), count: r.count })),
        },
        {
          key: "points-by-type",
          rows: data.pointsByType.map((r) => ({ type: label(TYPE_LABELS, r.type), entries: r.entries, points: r.points })),
        },
        {
          key: "orders-by-status",
          rows: data.ordersByStatus.map((r) => ({
            status: label(ORDER_STATUS_LABELS, r.status),
            orders: r.orders,
            points: r.points,
          })),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every figure is a count or total from database records. Recycling and composting outcomes are not shown,
          because no verified downstream processing records exist yet. The zone filter applies to reports and complaints only.
        </p>

        <form action="/admin/analytics" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="mb-1 block text-sm font-medium">From</label>
            <input id="from" name="from" type="date" defaultValue={range.fromStr || from}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-sm font-medium">To</label>
            <input id="to" name="to" type="date" defaultValue={range.toStr || to}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone</label>
            <select id="zone" name="zone" defaultValue={zoneId}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
            Apply
          </button>
        </form>

        {range.error && (
          <div className="mt-4">
            <ErrorNotice>{range.error}</ErrorNotice>
          </div>
        )}
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Analytics could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && (
          <p className="mt-3 text-xs text-gray-600">
            Showing {range.fromStr} to {range.toStr} ({range.days} days, UTC).
          </p>
        )}
      </section>

      {data && (
        <ul className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Average time to first staff decision on a report" value={hoursText(data.reviewHours)} />
          <StatCard label="Average time to resolve a complaint" value={hoursText(data.resolutionHours)} />
        </ul>
      )}

      {sections.map((s) => (
        <section key={s.key} className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{DATASETS[s.key].label}</h2>
            {canExport && (
              <Link href={exportHref(s.key)} className="text-sm font-semibold text-emerald-800 underline">
                Download CSV
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">{DATASETS[s.key].description}</p>
          <div className="mt-3">
            {s.rows.length === 0 ? (
              <EmptyState>No records in this range.</EmptyState>
            ) : (
              <SimpleTable columns={DATASETS[s.key].columns} rows={s.rows} caption={DATASETS[s.key].label} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
`);

write("app/admin/(panel)/exports/page.js", `
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "CSV Exports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminExportsPage() {
  await requirePermission("analytics.export");
  const range = parseRange("", "");

  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name").lean();
  } catch (err) {
    console.error("Load export zones failed:", err.message);
    loadError = true;
  }

  const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">CSV Exports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Exports contain counts and totals only. They never include names, emails, phone numbers or addresses.
          Every download is recorded in the audit log, and each person can download up to 20 files per hour.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Zones could not be loaded. You can still export for all zones.</ErrorNotice>
          </div>
        )}

        <form action="/api/admin/export" method="get" className="mt-4 space-y-4">
          <div>
            <label htmlFor="dataset" className="mb-1 block text-sm font-medium">Dataset</label>
            <select id="dataset" name="dataset" required defaultValue="" className={field}>
              <option value="" disabled>Choose a dataset</option>
              {DATASET_KEYS.map((k) => (
                <option key={k} value={k}>{DATASETS[k].label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="from" className="mb-1 block text-sm font-medium">From</label>
              <input id="from" name="from" type="date" required defaultValue={range.fromStr} className={field} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-sm font-medium">To</label>
              <input id="to" name="to" type="date" required defaultValue={range.toStr} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone (reports and complaints only)</label>
            <select id="zone" name="zone" defaultValue="" className={field}>
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit"
            className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Download CSV
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Available datasets</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {DATASET_KEYS.map((k) => (
            <li key={k}>
              <span className="font-semibold">{DATASETS[k].label}.</span> {DATASETS[k].description}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
`);

write("tests/unit/csv.test.js", `
import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("prefixes cells that could run as formulas", () => {
    ["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\\tTabbed", "\\rReturn"].forEach((v) => {
      expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
    });
  });

  it("keeps real numbers, including negative ones, as numbers", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(NaN)).toBe("");
  });

  it("writes missing values as empty cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells with commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\\nline2")).toBe('"line1\\nline2"');
  });

  it("applies both protections together", () => {
    expect(csvCell("=1,2")).toBe('"' + "'=1,2" + '"');
  });

  it("leaves plain text alone", () => {
    expect(csvCell("COLLECTED")).toBe("COLLECTED");
  });
});

describe("toCsv", () => {
  const columns = [
    { key: "status", label: "Status" },
    { key: "count", label: "Reports" },
  ];

  it("writes a header and one line per row", () => {
    const csv = toCsv(columns, [{ status: "COLLECTED", count: 2 }, { status: "=BAD()", count: 1 }]);
    expect(csv).toBe("Status,Reports\\r\\nCOLLECTED,2\\r\\n'=BAD(),1\\r\\n");
  });

  it("writes only the header when there are no rows", () => {
    expect(toCsv(columns, [])).toBe("Status,Reports\\r\\n");
  });
});
`);

write("tests/unit/analyticsRange.test.js", `
import { describe, it, expect } from "vitest";
import { parseRange, MAX_RANGE_DAYS } from "@/lib/analyticsRange";

const NOW = new Date("2026-11-15T10:00:00Z");

describe("parseRange", () => {
  it("defaults to the last 30 days including today", () => {
    const r = parseRange("", "", NOW);
    expect(r.toStr).toBe("2026-11-15");
    expect(r.fromStr).toBe("2026-10-17");
    expect(r.days).toBe(30);
    expect(r.toExclusive.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("uses the dates it is given", () => {
    const r = parseRange("2026-01-01", "2026-01-31", NOW);
    expect(r.days).toBe(31);
    expect(r.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("counts back 30 days from the end date when only the end is given", () => {
    const r = parseRange("", "2026-03-31", NOW);
    expect(r.fromStr).toBe("2026-03-02");
    expect(r.days).toBe(30);
  });

  it("rejects dates that are not real", () => {
    expect(parseRange("2026-02-30", "2026-03-01", NOW).error).toBeTruthy();
    expect(parseRange("abc", "2026-03-01", NOW).error).toBeTruthy();
    expect(parseRange("2026-03-01", "2026-13-01", NOW).error).toBeTruthy();
    expect(parseRange("2026-3-1", "2026-03-05", NOW).error).toBeTruthy();
  });

  it("rejects a start date after the end date", () => {
    expect(parseRange("2026-05-02", "2026-05-01", NOW).error).toMatch(/must not be after/i);
  });

  it("allows the maximum range and rejects anything longer", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(parseRange("2026-01-01", "2026-01-01", NOW).days).toBe(1);
    expect(parseRange("2025-01-01", "2026-01-01", NOW).days).toBe(366);
    expect(parseRange("2025-01-01", "2026-01-02", NOW).error).toMatch(/too long/i);
  });

  it("ignores values that are not text", () => {
    expect(parseRange(["2026-01-01"], 42, NOW).error).toBeTruthy();
  });
});
`);

write("tests/unit/analyticsDatasets.test.js", `
import { describe, it, expect } from "vitest";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";

describe("export datasets", () => {
  it("describes every dataset", () => {
    expect(DATASET_KEYS.length).toBeGreaterThan(0);
    DATASET_KEYS.forEach((k) => {
      const d = DATASETS[k];
      expect(d.label).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.columns.length).toBeGreaterThan(0);
      d.columns.forEach((c) => {
        expect(c.key).toBeTruthy();
        expect(c.label).toBeTruthy();
      });
    });
  });

  it("never offers a personal-data column", () => {
    DATASET_KEYS.forEach((k) => {
      DATASETS[k].columns.forEach((c) => {
        expect(/email|name|phone|address/i.test(c.key + " " + c.label)).toBe(false);
      });
    });
  });

  it("applies the zone filter only where records have a zone", () => {
    expect(DATASETS["reports-by-status"].zone).toBe(true);
    expect(DATASETS["reports-by-day"].zone).toBe(true);
    expect(DATASETS["complaints-by-status"].zone).toBe(true);
    expect(DATASETS["points-by-type"].zone).toBe(false);
    expect(DATASETS["orders-by-status"].zone).toBe(false);
  });
});
`);

write("tests/integration/exports.test.js", `
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

import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { signInAs, signOut } from "./actionHelpers.js";
import { GET } from "@/app/api/admin/export/route";
import { loadOverview } from "@/services/analytics";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function request(query) {
  return GET(new Request("http://localhost/api/admin/export?" + new URLSearchParams(query).toString()));
}

async function asAdmin() {
  const admin = await makeUser({ role: "SUPER_ADMIN" });
  signInAs(admin);
  return admin;
}

function header(key) {
  return DATASETS[key].columns.map((c) => c.label).join(",") + "\\r\\n";
}

describe("export permissions", () => {
  it("refuses a visitor, a resident, an analyst and an operations manager", async () => {
    const none = await request({ dataset: "reports-by-status" });
    expect(none.status).toBe(401);

    for (const role of ["RESIDENT", "READ_ONLY_ANALYST", "OPERATIONS_MANAGER", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const res = await request({ dataset: "reports-by-status" });
      expect(res.status).toBe(403);
    }
    expect(await AuditLog.countDocuments({ action: "export.download" })).toBe(0);
  });
});

describe("export content", () => {
  it("returns a CSV with the right counts and download headers", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await asAdmin();

    const res = await request({ dataset: "reports-by-status" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\\/csv/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="reports-by-status_\\d{4}-\\d{2}-\\d{2}_to_\\d{4}-\\d{2}-\\d{2}\\.csv"/
    );
    const body = await res.text();
    expect(body.split("\\r\\n")).toEqual(["Status,Reports", "COLLECTED,1", "SUBMITTED,2", ""]);
  });

  it("records every export in the audit log", async () => {
    const admin = await asAdmin();
    await request({ dataset: "points-by-type" });
    const logs = await AuditLog.find({ action: "export.download" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe("points-by-type");
    expect(String(logs[0].actor)).toBe(String(admin._id));
    expect(logs[0].metadata.rows).toBe(0);
  });

  it("returns only the header when there is nothing to export", async () => {
    await asAdmin();
    for (const key of DATASET_KEYS) {
      const res = await request({ dataset: key });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(header(key));
    }
  });

  it("respects the date range", async () => {
    const resident = await makeUser();
    const old = await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await WasteReport.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date("2020-01-15T00:00:00Z") } });
    await asAdmin();

    const recent = await (await request({ dataset: "reports-by-status" })).text();
    expect(recent.split("\\r\\n")).toEqual(["Status,Reports", "COLLECTED,1", ""]);

    const past = await (await request({ dataset: "reports-by-status", from: "2020-01-01", to: "2020-01-31" })).text();
    expect(past.split("\\r\\n")).toEqual(["Status,Reports", "SUBMITTED,1", ""]);
  });

  it("filters reports by zone", async () => {
    const resident = await makeUser();
    const inside = await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const zone = newId();
    await WasteReport.updateOne({ _id: inside._id }, { $set: { serviceZone: zone } });
    await asAdmin();

    const res = await request({ dataset: "reports-by-status", zone: String(zone) });
    expect((await res.text()).split("\\r\\n")).toEqual(["Status,Reports", "SUBMITTED,1", ""]);
  });

  it("never puts a resident's name or email in any export", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "SUBMITTED");
    await Complaint.create({
      ticketNumber: "ECC-20261101-00000009",
      reporter: resident._id,
      category: "OTHER",
      description: "Test complaint description",
    });
    await asAdmin();

    for (const key of DATASET_KEYS) {
      const body = await (await request({ dataset: key })).text();
      expect(body.includes(resident.email)).toBe(false);
      expect(body.includes(resident.name)).toBe(false);
    }
  });
});

describe("export validation", () => {
  it("rejects unknown datasets, bad dates, long ranges and bad zones", async () => {
    await asAdmin();
    expect((await request({ dataset: "users" })).status).toBe(400);
    expect((await request({ dataset: "__proto__" })).status).toBe(400);
    expect((await request({})).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2026-02-30" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2026-05-02", to: "2026-05-01" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2024-01-01", to: "2026-01-01" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", zone: "not-an-id" })).status).toBe(400);
    expect(await AuditLog.countDocuments({ action: "export.download" })).toBe(0);
  });

  it("limits each person to twenty exports per hour", async () => {
    await asAdmin();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await request({ dataset: "reports-by-status" })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("loadOverview averages", () => {
  it("averages the time to the first staff decision and to complaint resolution", async () => {
    const resident = await makeUser();
    const base = Date.now() - 10 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;

    for (const decisionHours of [2, 4]) {
      const r = await makeReport(resident._id, newId(), "VERIFIED");
      await WasteReport.collection.updateOne(
        { _id: r._id },
        {
          $set: {
            createdAt: new Date(base),
            statusHistory: [
              { status: "SUBMITTED", at: new Date(base) },
              { status: "VERIFIED", at: new Date(base + decisionHours * hour) },
            ],
          },
        }
      );
    }

    const c = await Complaint.create({
      ticketNumber: "ECC-20261101-00000001",
      reporter: resident._id,
      category: "OTHER",
      description: "Test complaint description",
      status: "RESOLVED",
      resolvedAt: new Date(),
    });
    await Complaint.collection.updateOne(
      { _id: c._id },
      { $set: { createdAt: new Date(base), resolvedAt: new Date(base + 2 * hour) } }
    );

    const overview = await loadOverview(parseRange("", ""), "");
    expect(overview.reviewHours).toEqual({ hours: 3, count: 2 });
    expect(overview.resolutionHours).toEqual({ hours: 2, count: 1 });
  });

  it("returns no average when nothing qualifies", async () => {
    const overview = await loadOverview(parseRange("", ""), "");
    expect(overview.reviewHours).toBeNull();
    expect(overview.resolutionHours).toBeNull();
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
  if (f.startsWith("app/admin/") && !src.includes("requirePermission(")) problems.push("missing page permission check");
  if (f === "app/api/admin/export/route.js") {
    ["analytics.export", "no-store", "export.download", "parseRange"].forEach((part) => {
      if (!src.includes(part)) problems.push("route is missing " + part);
    });
  }
  if (f === "lib/csv.js" && !src.includes("\"'\"")) problems.push("formula protection is missing");
  if (f === "lib/analyticsDatasets.js" && /email|phone|address/i.test(src)) problems.push("personal-data column not allowed");
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