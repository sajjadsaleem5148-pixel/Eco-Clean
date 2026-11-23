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
