import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { listActiveAssignments } from "@/services/assignments";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Assignments | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminAssignmentsPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const raw = typeof sp?.collector === "string" ? sp.collector : "";
  const collectorId = /^[a-f\d]{24}$/i.test(raw) ? raw : "";

  let data = null;
  let loadError = false;
  try {
    data = await listActiveAssignments({ collectorId: collectorId });
  } catch (err) {
    console.error("Load assignments failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Active jobs that a collector currently holds. Finished jobs are not listed here. This page is read-only: to
          assign or reassign a collector, open the report. At most 500 active jobs are checked.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Assignments could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && (
          <p className="mt-3 text-sm text-gray-800">
            Verified reports still waiting for a collector:{" "}
            <Link href="/admin/reports?status=VERIFIED" className="font-semibold text-emerald-800 underline">
              {data.waitingForCollector}
            </Link>
          </p>
        )}
      </section>

      {data && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Jobs per collector</h2>
          {data.summary.length === 0 ? (
            <div className="mt-3">
              <EmptyState>No collector holds an active job right now.</EmptyState>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Collector</th>
                    <th scope="col" className="py-2 pr-4">Assigned</th>
                    <th scope="col" className="py-2 pr-4">Accepted</th>
                    <th scope="col" className="py-2 pr-4">On the way</th>
                    <th scope="col" className="py-2 pr-4">Arrived</th>
                    <th scope="col" className="py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((s) => (
                    <tr key={s.collectorId} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium">{s.name}</td>
                      <td className="py-2 pr-4">{s.ASSIGNED}</td>
                      <td className="py-2 pr-4">{s.ACCEPTED}</td>
                      <td className="py-2 pr-4">{s.ON_THE_WAY}</td>
                      <td className="py-2 pr-4">{s.ARRIVED}</td>
                      <td className="py-2 font-semibold">{s.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {data && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Active jobs</h2>

          <form action="/admin/assignments" method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="collector" className="mb-1 block text-sm font-medium">Collector</label>
              <select id="collector" name="collector" defaultValue={collectorId}
                className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">All collectors</option>
                {data.summary.map((s) => (
                  <option key={s.collectorId} value={s.collectorId}>{s.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
              Apply
            </button>
            {collectorId && (
              <Link href="/admin/assignments" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">
                Clear filter
              </Link>
            )}
          </form>

          {data.items.length === 0 ? (
            <div className="mt-4">
              <EmptyState>No active jobs match this filter.</EmptyState>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="border-b border-gray-200 text-gray-600">
                  <tr>
                    <th scope="col" className="py-2 pr-4">Report</th>
                    <th scope="col" className="py-2 pr-4">Zone</th>
                    <th scope="col" className="py-2 pr-4">Collector</th>
                    <th scope="col" className="py-2 pr-4">Status</th>
                    <th scope="col" className="py-2 pr-4">Assigned</th>
                    <th scope="col" className="py-2">Hours since assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.reportId} className="border-b border-gray-100">
                      <td className="py-2 pr-4">
                        <Link href={"/admin/reports/" + i.reportId} className="font-semibold text-emerald-800 underline">
                          {i.reportId}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{i.zoneName}</td>
                      <td className="py-2 pr-4">{i.collectorName}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={i.status} label={STATUS_LABELS[i.status]} />
                      </td>
                      <td className="py-2 pr-4">{i.assignedAt ? formatDateTime(i.assignedAt) : "-"}</td>
                      <td className="py-2">{i.hoursWaiting === null ? "-" : i.hoursWaiting}</td>
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
