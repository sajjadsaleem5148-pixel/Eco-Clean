import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import { collectorStepsFor, COLLECTOR_LABELS } from "@/lib/reportTransitions";
import JobActionForm from "@/components/forms/JobActionForm";

export const metadata = { title: "Job Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorJobDetailPage({ params }) {
  const user = await requireRole(["COLLECTOR"]);
  const { id } = await params;

  let job = null;
  try {
    await connectDB();
    // assignedCollector ka filter zaroori hai: doosre ki job ka ID jaanne se bhi kuch nahi milta.
    // Reporter ki maloomat kabhi select nahi hoti.
    job = await WasteReport.findOne({ reportId: id, assignedCollector: user.id, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .select("reportId category serviceZone address description status statusHistory")
      .lean();
  } catch (err) {
    console.error("Load job failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This job could not be loaded. Please try again later.
      </p>
    );
  }

  if (!job) notFound();

  const steps = collectorStepsFor(job.status).map((s) => ({ value: s, label: COLLECTOR_LABELS[s] }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/collector/jobs" className="text-sm font-semibold text-emerald-800 underline">Back to my jobs</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Job {job.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">Status: {STATUS_LABELS[job.status] || job.status}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{job.category ? job.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{job.serviceZone ? job.serviceZone.name : "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{job.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{job.description}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Update job</h2>
        {steps.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No further actions are available for this job.</p>
        ) : (
          <div className="mt-3">
            <JobActionForm reportId={job.reportId} steps={steps} />
            <p className="mt-3 text-xs text-gray-600">
              Photo evidence upload is not available yet. Your note is saved in the job history.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Job history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {job.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
