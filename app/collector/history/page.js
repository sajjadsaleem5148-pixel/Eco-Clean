import { requireRole } from "@/lib/auth/guards";
import { listCollectorHistory, HISTORY_STATUSES } from "@/services/collectorHistory";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Job History | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/collector/history" + (qs ? "?" + qs : "");
}

export default async function CollectorHistoryPage({ searchParams }) {
  const user = await requireRole(["COLLECTOR"]);
  const sp = await searchParams;
  const status = HISTORY_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  let data = null;
  let loadError = false;
  try {
    // Only this collector's own finished jobs: the id comes from the server session.
    data = await listCollectorHistory(user.id, { status: status, page: page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("Load collector history failed:", err.message);
    loadError = true;
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tabs = [{ label: "All", href: href(1, null), active: !status }].concat(
    HISTORY_STATUSES.map((s) => ({ label: STATUS_LABELS[s], href: href(1, s), active: status === s }))
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Job History</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your finished jobs. Active jobs are under My Jobs. Resident details are never shown here.
        {data ? " Total: " + data.total + "." : ""}
      </p>

      <div className="mt-4">
        <FilterTabs label="Result filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your history could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && data && data.items.length === 0 && (
        <div className="mt-4">
          <EmptyState>You have no finished jobs yet.</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Result</th>
                <th scope="col" className="py-2 pr-4">Finished</th>
                <th scope="col" className="py-2">Your note</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.reportId} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 font-medium">{i.reportId}</td>
                  <td className="py-2 pr-4">{i.zoneName}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={i.status} label={STATUS_LABELS[i.status]} />
                  </td>
                  <td className="py-2 pr-4">{i.finishedAt ? formatDateTime(i.finishedAt) : "-"}</td>
                  <td className="py-2">{i.note || "-"}</td>
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
