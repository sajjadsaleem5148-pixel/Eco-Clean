import Link from "next/link";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";

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
    // Hamesha apna data: id server ke session se aati hai, URL se nahi.
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
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Your data could not be loaded. Please try again later.
          </p>
        )}
      </section>

      {dbOk && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.label} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">{c.label}</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">
                {c.value === null || c.value === undefined ? "-" : c.value}
              </p>
              <Link href={c.href} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      {dbOk && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Recent Green Points activity</h2>
          {!m.recent || m.recent.length === 0 ? (
            <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No points activity yet. Points are awarded only after staff verify a collection.
            </p>
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
