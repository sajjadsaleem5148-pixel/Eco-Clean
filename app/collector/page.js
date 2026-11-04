import Link from "next/link";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";

export const metadata = { title: "Collector Home | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("Collector home metric failed:", err.message);
    return null;
  }
}

export default async function CollectorHomePage() {
  const user = await requireRole(["COLLECTOR"]);

  let dbOk = true;
  try {
    await connectDB();
  } catch (err) {
    console.error("Collector home DB connect failed:", err.message);
    dbOk = false;
  }

  let newJobs = null;
  let activeJobs = null;
  let doneJobs = null;
  if (dbOk) {
    // Sirf is collector ko assign hui jobs.
    const me = new mongoose.Types.ObjectId(user.id);
    const reports = mongoose.connection.collection("wastereports");
    [newJobs, activeJobs, doneJobs] = await Promise.all([
      safe(() => reports.countDocuments({ assignedCollector: me, deletedAt: null, status: "ASSIGNED" })),
      safe(() => reports.countDocuments({
        assignedCollector: me,
        deletedAt: null,
        status: { $in: ["ACCEPTED", "ON_THE_WAY", "ARRIVED"] },
      })),
      safe(() => reports.countDocuments({ assignedCollector: me, deletedAt: null, status: "COLLECTED" })),
    ]);
  }

  const cards = [
    { label: "New jobs waiting for you to accept", value: newJobs },
    { label: "Jobs in progress", value: activeJobs },
    { label: "Jobs completed", value: doneJobs },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-emerald-900">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-gray-700">These numbers count only the jobs assigned to you.</p>
        <Link href="/collector/jobs" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          Open my jobs
        </Link>
        {!dbOk && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Your jobs could not be loaded. Please try again later.
          </p>
        )}
      </section>

      {dbOk && (
        <ul className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <li key={c.label} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">{c.label}</p>
              <p className="mt-1 text-3xl font-bold text-emerald-900">
                {c.value === null || c.value === undefined ? "-" : c.value}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
