const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("app/admin/(panel)/page.js", `
import Link from "next/link";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";

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
    { label: "Suspended accounts", value: m.suspended, perm: "users.read", href: "/admin/users" },
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
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            The database is unavailable, so no metrics can be shown.
          </p>
        )}
      </section>

      {dbOk && cards.length === 0 && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Your role has no dashboard metrics. Use the sidebar to open your modules.
        </p>
      )}

      {dbOk && cards.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.label} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">{c.label}</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">{c.value === null || c.value === undefined ? "-" : c.value}</p>
              <Link href={c.href} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dbOk && can("audit.read") && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Recent administrative activity</h2>
          {!m.recent || m.recent.length === 0 ? (
            <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No activity recorded yet.
            </p>
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

console.log("\\nDashboard file ban gayi.");
