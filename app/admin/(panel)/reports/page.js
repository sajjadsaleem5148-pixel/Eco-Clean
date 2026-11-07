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
