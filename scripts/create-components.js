const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required earlier files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/reportStatus.js",
  "lib/points/labels.js",
  "lib/permissions/roles.js",
  "models/WasteReport.js",
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

write("lib/statusTone.js", `
// Decides the colour group of a status. Pure logic, no UI.
const TONES = {
  success: [
    "COLLECTED", "COMPLETED", "RESOLVED", "PUBLISHED", "ACTIVE", "VERIFIED",
    "RESPONDED", "APPROVED", "READY_FOR_COLLECTION",
  ],
  danger: ["REJECTED", "CANCELLED", "UNABLE_TO_COLLECT", "SUSPENDED", "ARCHIVED"],
  warning: ["ESCALATED", "PENDING", "UNDER_REVIEW", "ON_THE_WAY", "ARRIVED"],
  info: [
    "SUBMITTED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "PREPARING",
    "DISPATCHED", "NEW", "DRAFT",
  ],
};

export function toneFor(status) {
  if (!status) return "neutral";
  const key = String(status);
  for (const tone of Object.keys(TONES)) {
    if (TONES[tone].includes(key)) return tone;
  }
  return "neutral";
}
`);

write("components/ui/StatusBadge.js", `
import { toneFor } from "@/lib/statusTone";

const STYLES = {
  neutral: "border-gray-300 bg-gray-100 text-gray-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-800",
  info: "border-blue-300 bg-blue-50 text-blue-900",
};

// The text label is always shown, so meaning never depends on colour alone.
export default function StatusBadge({ status, label }) {
  const tone = toneFor(status);
  return (
    <span className={"inline-block rounded border px-2 py-0.5 text-xs font-semibold " + STYLES[tone]}>
      {label || status}
    </span>
  );
}
`);

write("components/ui/EmptyState.js", `
export default function EmptyState({ children }) {
  return (
    <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
      {children}
    </p>
  );
}
`);

write("components/ui/ErrorNotice.js", `
export default function ErrorNotice({ children }) {
  return (
    <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {children}
    </p>
  );
}
`);

write("components/dashboard/StatCard.js", `
import Link from "next/link";

export default function StatCard({ label, value, href, linkLabel = "Open" }) {
  const missing = value === null || value === undefined;
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-emerald-900">
        {missing ? "-" : value}
        {missing && <span className="sr-only">not available</span>}
      </p>
      {href && (
        <Link href={href} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">
          {linkLabel}
        </Link>
      )}
    </li>
  );
}
`);

write("components/tables/FilterTabs.js", `
import Link from "next/link";

// items: [{ label, href, active }]
export default function FilterTabs({ label, items }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 text-sm">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={
            "rounded-md border px-3 py-2 " +
            (item.active ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
`);

write("components/tables/Pagination.js", `
import Link from "next/link";

export default function Pagination({ page, pages, prevHref, nextHref }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={prevHref} className="font-semibold text-emerald-800 underline">Previous</Link>
      ) : (
        <span />
      )}
      <span>Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={nextHref} className="font-semibold text-emerald-800 underline">Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
`);

write("tests/unit/statusTone.test.js", `
import { describe, it, expect } from "vitest";
import { toneFor } from "@/lib/statusTone";

describe("toneFor", () => {
  it("marks finished good outcomes as success", () => {
    ["COLLECTED", "COMPLETED", "RESOLVED", "PUBLISHED"].forEach((s) => {
      expect(toneFor(s)).toBe("success");
    });
  });

  it("marks failures and removals as danger", () => {
    ["REJECTED", "CANCELLED", "UNABLE_TO_COLLECT", "SUSPENDED"].forEach((s) => {
      expect(toneFor(s)).toBe("danger");
    });
  });

  it("marks things that need attention as warning", () => {
    expect(toneFor("ESCALATED")).toBe("warning");
    expect(toneFor("PENDING")).toBe("warning");
  });

  it("marks work in progress as info", () => {
    expect(toneFor("SUBMITTED")).toBe("info");
    expect(toneFor("ASSIGNED")).toBe("info");
  });

  it("falls back to neutral for unknown or missing values", () => {
    expect(toneFor("SOMETHING_ELSE")).toBe("neutral");
    expect(toneFor(undefined)).toBe("neutral");
    expect(toneFor(null)).toBe("neutral");
    expect(toneFor("")).toBe("neutral");
  });
});
`);

write("app/admin/(panel)/reports/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { REPORT_STATUSES, STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Garbage Reports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/admin/reports" + (qs ? "?" + qs : "");
}

export default async function AdminReportsPage({ searchParams }) {
  await requirePermission("reports.read");
  const sp = await searchParams;
  const status = REPORT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let reports = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [reports, total] = await Promise.all([
      WasteReport.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("category", "name")
        .populate("serviceZone", "name")
        .lean(),
      WasteReport.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load admin reports failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs = [{ label: "All", href: href(1, null), active: !status }].concat(
    REPORT_STATUSES.map((s) => ({ label: STATUS_LABELS[s], href: href(1, s), active: status === s }))
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Garbage Reports</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <div className="mt-4">
        <FilterTabs label="Status filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Reports could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && reports.length === 0 && (
        <div className="mt-4">
          <EmptyState>No reports match this filter.</EmptyState>
        </div>
      )}

      {reports.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report ID</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Flags</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/reports/" + r.reportId} className="font-semibold text-emerald-800 underline">
                      {r.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.category ? r.category.name : "-"}</td>
                  <td className="py-2 pr-4">{r.serviceZone ? r.serviceZone.name : "-"}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} label={STATUS_LABELS[r.status]} />
                  </td>
                  <td className="py-2 pr-4">{r.possibleDuplicateOf ? "Possible duplicate" : ""}</td>
                  <td className="py-2">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} prevHref={href(page - 1, status)} nextHref={href(page + 1, status)} />
    </section>
  );
}
`);

write("app/admin/(panel)/page.js", `
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Dashboard | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("Dashboard metric failed:", err.message);
    return null;
  }
}

function col(name) {
  return mongoose.connection.collection(name);
}

async function sumPoints(type) {
  const r = await col("greenpointstransactions")
    .aggregate([{ $match: { type } }, { $group: { _id: null, total: { $sum: "$points" } } }])
    .toArray();
  return r.length ? r[0].total : 0;
}

export default async function AdminDashboardPage() {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  const can = (p) => hasPermission(user.role, p);

  let dbOk = true;
  try {
    await connectDB();
  } catch (err) {
    console.error("Dashboard DB connect failed:", err.message);
    dbOk = false;
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const m = {};
  if (dbOk) {
    const [
      residents, collectors, suspended, awaiting, toAssign, collectedToday,
      openComplaints, pendingOrders, lowStock, earned, redeemedRaw, refundedRaw, recent,
    ] = await Promise.all([
      safe(() => col("users").countDocuments({ role: "RESIDENT", deletedAt: null })),
      safe(() => col("users").countDocuments({ role: "COLLECTOR", status: "ACTIVE", deletedAt: null })),
      safe(() => col("users").countDocuments({ status: "SUSPENDED", deletedAt: null })),
      safe(() => col("wastereports").countDocuments({ status: { $in: ["SUBMITTED", "UNDER_REVIEW"] }, deletedAt: null })),
      safe(() => col("wastereports").countDocuments({ status: "VERIFIED", deletedAt: null })),
      safe(() => col("wastereports").countDocuments({
        deletedAt: null,
        statusHistory: { $elemMatch: { status: "COLLECTED", at: { $gte: startOfDay } } },
      })),
      safe(() => col("complaints").countDocuments({
        status: { $in: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"] },
        deletedAt: null,
      })),
      safe(() => col("rewardorders").countDocuments({ status: "PENDING" })),
      safe(() => col("rewardproducts").countDocuments({
        deletedAt: null,
        $expr: { $lte: ["$stockAvailable", "$lowStockThreshold"] },
      })),
      safe(() => sumPoints("EARN")),
      safe(() => sumPoints("REDEEM")),
      safe(() => sumPoints("REFUND")),
      can("audit.read")
        ? safe(() => col("auditlogs").find({}).sort({ createdAt: -1 }).limit(10).toArray())
        : Promise.resolve(null),
    ]);
    Object.assign(m, {
      residents, collectors, suspended, awaiting, toAssign, collectedToday,
      openComplaints, pendingOrders, lowStock, earned, recent,
      redeemed: redeemedRaw === null || refundedRaw === null ? null : -(redeemedRaw + refundedRaw),
    });
  }

  const cards = [
    { label: "Registered residents", value: m.residents, perm: "users.read", href: "/admin/users" },
    { label: "Active collectors", value: m.collectors, perm: "collections.manage", href: "/admin/collectors" },
    { label: "Suspended accounts", value: m.suspended, perm: "users.read", href: "/admin/users?status=SUSPENDED" },
    { label: "Reports awaiting verification", value: m.awaiting, perm: "reports.read", href: "/admin/reports?status=SUBMITTED" },
    { label: "Verified, waiting for a collector", value: m.toAssign, perm: "reports.read", href: "/admin/reports?status=VERIFIED" },
    { label: "Collected today (UTC)", value: m.collectedToday, perm: "reports.read", href: "/admin/reports?status=COLLECTED" },
    { label: "Open complaints", value: m.openComplaints, perm: "complaints.resolve", href: "/admin/complaints" },
    { label: "Pending reward orders", value: m.pendingOrders, perm: "rewards.manage", href: "/admin/orders?status=PENDING" },
    { label: "Low-stock products", value: m.lowStock, perm: "inventory.manage", href: "/admin/inventory" },
    { label: "Green Points earned (total)", value: m.earned, perm: "points.read", href: "/admin/green-points" },
    { label: "Green Points redeemed (net of refunds)", value: m.redeemed, perm: "points.read", href: "/admin/green-points" },
  ].filter((c) => can(c.perm));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Signed in as {user.name} ({user.role}). Every number below is a live count from the database.
          Date and zone filters and charts are not available yet.
        </p>
        {!dbOk && (
          <div className="mt-4">
            <ErrorNotice>The database is unavailable, so no metrics can be shown.</ErrorNotice>
          </div>
        )}
      </section>

      {dbOk && cards.length === 0 && (
        <EmptyState>Your role has no dashboard metrics. Use the sidebar to open your modules.</EmptyState>
      )}

      {dbOk && cards.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} href={c.href} />
          ))}
        </ul>
      )}

      {dbOk && can("audit.read") && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Recent administrative activity</h2>
          {!m.recent || m.recent.length === 0 ? (
            <div className="mt-3">
              <EmptyState>No activity recorded yet.</EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">When</th>
                    <th scope="col" className="py-2 pr-4">Action</th>
                    <th scope="col" className="py-2">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((a) => (
                    <tr key={a._id.toString()} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{formatDateTime(a.createdAt)}</td>
                      <td className="py-2 pr-4 font-medium">{a.action}</td>
                      <td className="py-2">{a.targetType || "-"} {a.targetId || ""}</td>
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

write("app/dashboard/page.js", `
import Link from "next/link";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Dashboard | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("Resident dashboard metric failed:", err.message);
    return null;
  }
}

function col(name) {
  return mongoose.connection.collection(name);
}

export default async function DashboardPage() {
  const user = await requireRole(["RESIDENT"]);

  let dbOk = true;
  try {
    await connectDB();
  } catch (err) {
    console.error("Resident dashboard DB connect failed:", err.message);
    dbOk = false;
  }

  const m = {};
  if (dbOk) {
    // Always the signed-in user's own data: the id comes from the server session, never from the URL.
    const me = new mongoose.Types.ObjectId(user.id);
    const [total, awaiting, active, collected, complaints, orders, account, recent] = await Promise.all([
      safe(() => col("wastereports").countDocuments({ reporter: me, deletedAt: null })),
      safe(() => col("wastereports").countDocuments({ reporter: me, deletedAt: null, status: { $in: ["SUBMITTED", "UNDER_REVIEW"] } })),
      safe(() => col("wastereports").countDocuments({
        reporter: me,
        deletedAt: null,
        status: { $in: ["VERIFIED", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"] },
      })),
      safe(() => col("wastereports").countDocuments({ reporter: me, deletedAt: null, status: "COLLECTED" })),
      safe(() => col("complaints").countDocuments({
        reporter: me,
        deletedAt: null,
        status: { $in: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"] },
      })),
      safe(() => col("rewardorders").countDocuments({
        user: me,
        status: { $in: ["PENDING", "APPROVED", "PREPARING", "READY_FOR_COLLECTION", "DISPATCHED"] },
      })),
      safe(() => col("greenpointsaccounts").findOne({ user: me })),
      safe(() => col("greenpointstransactions").find({ user: me }).sort({ createdAt: -1 }).limit(5).toArray()),
    ]);
    Object.assign(m, {
      total, awaiting, active, collected, complaints, orders, recent,
      balance: account === null ? null : account ? account.balance : 0,
    });
  }

  const cards = [
    { label: "Reports submitted", value: m.total, href: "/dashboard/reports" },
    { label: "Waiting for staff review", value: m.awaiting, href: "/dashboard/reports" },
    { label: "Verified or assigned (on the way to collection)", value: m.active, href: "/dashboard/reports" },
    { label: "Collected", value: m.collected, href: "/dashboard/reports" },
    { label: "Open complaints", value: m.complaints, href: "/dashboard/complaints" },
    { label: "Active reward orders", value: m.orders, href: "/dashboard/orders" },
    { label: "Green Points balance", value: m.balance, href: "/dashboard/green-points" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-emerald-900">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-gray-700">
          Every number below is a live count of your own records. Collection schedules are not available yet,
          so no pickup is shown as confirmed.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/report-garbage" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
            Report garbage
          </Link>
          <Link href="/complaints" className="inline-flex min-h-11 items-center rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
            Submit a complaint
          </Link>
        </div>
        {!dbOk && (
          <div className="mt-4">
            <ErrorNotice>Your data could not be loaded. Please try again later.</ErrorNotice>
          </div>
        )}
      </section>

      {dbOk && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} href={c.href} />
          ))}
        </ul>
      )}

      {dbOk && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Recent Green Points activity</h2>
          {!m.recent || m.recent.length === 0 ? (
            <div className="mt-3">
              <EmptyState>No points activity yet. Points are awarded only after staff verify a collection.</EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Date</th>
                    <th scope="col" className="py-2 pr-4">Type</th>
                    <th scope="col" className="py-2 pr-4">Points</th>
                    <th scope="col" className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {m.recent.map((t) => (
                    <tr key={t._id.toString()} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{formatDateTime(t.createdAt)}</td>
                      <td className="py-2 pr-4">{TYPE_LABELS[t.type] || t.type}</td>
                      <td className="py-2 pr-4 font-semibold">{formatPoints(t.points)}</td>
                      <td className="py-2">{t.reason}</td>
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

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (empty): " + f);
    failed++;
  } else if (src.includes("PlaceholderPage")) {
    console.log(" FAIL (old placeholder): " + f);
    failed++;
  } else if (romanUrdu.test(src)) {
    console.log(" FAIL (Roman Urdu present): " + f);
    failed++;
  } else if (f.startsWith("app/") && !src.includes("@/components/")) {
    console.log(" FAIL (page does not use components): " + f);
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