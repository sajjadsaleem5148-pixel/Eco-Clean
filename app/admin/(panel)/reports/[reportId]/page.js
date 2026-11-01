import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import User from "@/models/User";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import { decisionsFor, DECISION_LABELS, ASSIGNABLE_FROM } from "@/lib/reportTransitions";
import ReportReviewForm from "@/components/forms/ReportReviewForm";
import AssignForm from "@/components/forms/AssignForm";

export const metadata = { title: "Report Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminReportDetailPage({ params }) {
  const user = await requirePermission("reports.read");
  const { reportId } = await params;
  const canVerify = hasPermission(user.role, "reports.verify");
  const canAssign = hasPermission(user.role, "reports.assign");
  const canSeeUser = hasPermission(user.role, "users.read");

  let report = null;
  let collectors = [];
  try {
    await connectDB();
    report = await WasteReport.findOne({ reportId, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .populate("reporter", "name email")
      .populate("assignedCollector", "name")
      .populate("possibleDuplicateOf", "reportId status")
      .lean();

    if (report && canAssign && ASSIGNABLE_FROM.includes(report.status) && report.serviceZone) {
      const list = await User.find({
        role: "COLLECTOR",
        status: "ACTIVE",
        deletedAt: null,
        serviceZone: report.serviceZone._id,
      }).sort({ name: 1 }).select("name").lean();
      collectors = list.map((c) => ({ id: c._id.toString(), name: c.name }));
    }
  } catch (err) {
    console.error("Load admin report failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This report could not be loaded. Please try again later.
      </p>
    );
  }

  if (!report) notFound();

  const decisions = decisionsFor(report.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  const assignable = ASSIGNABLE_FROM.includes(report.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/reports" className="text-sm font-semibold text-emerald-800 underline">Back to reports</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Report {report.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">Status: {STATUS_LABELS[report.status] || report.status}</p>
        {report.assignedCollector && (
          <p className="mt-1 text-sm text-gray-700">Assigned collector: {report.assignedCollector.name}</p>
        )}

        {report.possibleDuplicateOf && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Possible duplicate of{" "}
            <Link href={"/admin/reports/" + report.possibleDuplicateOf.reportId} className="font-semibold underline">
              {report.possibleDuplicateOf.reportId}
            </Link>
            . Staff must confirm before rejecting.
          </p>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{report.category ? report.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{report.serviceZone ? report.serviceZone.name : "-"}</dd></div>
          {canSeeUser && report.reporter && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-gray-600">Reporter</dt>
              <dd>{report.reporter.name} ({report.reporter.email})</dd>
            </div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{report.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{report.description}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Review</h2>
        {!canVerify && (
          <p className="mt-2 text-sm text-gray-700">Your role can view reports but cannot verify or reject them.</p>
        )}
        {canVerify && decisions.length === 0 && (
          <p className="mt-2 text-sm text-gray-700">No review actions are available for this status.</p>
        )}
        {canVerify && decisions.length > 0 && (
          <div className="mt-3">
            <ReportReviewForm reportId={report.reportId} decisions={decisions} />
          </div>
        )}
      </section>

      {assignable && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{report.status === "ASSIGNED" ? "Reassign collector" : "Assign collector"}</h2>
          {!canAssign && (
            <p className="mt-2 text-sm text-gray-700">Your role cannot assign collectors.</p>
          )}
          {canAssign && collectors.length === 0 && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              No active collectors are available in this zone. Create one in the Collectors section.
            </p>
          )}
          {canAssign && collectors.length > 0 && (
            <div className="mt-3">
              <AssignForm reportId={report.reportId} collectors={collectors} isReassign={report.status === "ASSIGNED"} />
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {report.statusHistory.map((h, i) => (
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
