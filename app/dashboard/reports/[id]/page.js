import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "Report Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }) {
  const user = await requireRole(["RESIDENT"]);
  const { id } = await params;

  let report = null;
  try {
    await connectDB();
    report = await WasteReport.findOne({ reportId: id, reporter: user.id, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .lean();
  } catch (err) {
    console.error("Load report failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This report could not be loaded. Please try again later.
      </p>
    );
  }

  if (!report) notFound();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/dashboard/reports" className="text-sm font-semibold text-emerald-800 underline">
          Back to my reports
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Report {report.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {STATUS_LABELS[report.status] || report.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{report.category ? report.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{report.serviceZone ? report.serviceZone.name : "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{report.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{report.description}</dd></div>
        </dl>
      </section>

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
