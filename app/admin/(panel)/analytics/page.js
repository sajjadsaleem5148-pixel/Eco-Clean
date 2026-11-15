import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS } from "@/lib/analyticsDatasets";
import { loadOverview } from "@/services/analytics";
import { STATUS_LABELS } from "@/lib/reportStatus";
import { COMPLAINT_STATUS_LABELS } from "@/lib/complaintStatus";
import { ORDER_STATUS_LABELS } from "@/lib/rewardStatus";
import { TYPE_LABELS } from "@/lib/points/labels";
import StatCard from "@/components/dashboard/StatCard";
import SimpleTable from "@/components/tables/SimpleTable";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Analytics | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function label(map, value) {
  return map[value] || value;
}

function hoursText(result) {
  return result ? result.hours + " h (" + result.count + " records)" : null;
}

export default async function AdminAnalyticsPage({ searchParams }) {
  const user = await requirePermission("analytics.read");
  const canExport = hasPermission(user.role, "analytics.export");
  const sp = await searchParams;
  const from = typeof sp?.from === "string" ? sp.from : "";
  const to = typeof sp?.to === "string" ? sp.to : "";
  const zoneRaw = typeof sp?.zone === "string" ? sp.zone : "";
  const zoneId = /^[a-f\d]{24}$/i.test(zoneRaw) ? zoneRaw : "";
  const range = parseRange(from, to);

  let zones = [];
  let data = null;
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name").lean();
    if (!range.error) data = await loadOverview(range, zoneId);
  } catch (err) {
    console.error("Load analytics failed:", err.message);
    loadError = true;
  }

  function exportHref(key) {
    const q = new URLSearchParams({ dataset: key, from: range.fromStr, to: range.toStr, zone: zoneId });
    return "/api/admin/export?" + q.toString();
  }

  const sections = data
    ? [
        {
          key: "reports-by-status",
          rows: data.reportsByStatus.map((r) => ({ status: label(STATUS_LABELS, r.status), count: r.count })),
        },
        { key: "reports-by-day", rows: data.reportsByDay },
        {
          key: "complaints-by-status",
          rows: data.complaintsByStatus.map((r) => ({ status: label(COMPLAINT_STATUS_LABELS, r.status), count: r.count })),
        },
        {
          key: "points-by-type",
          rows: data.pointsByType.map((r) => ({ type: label(TYPE_LABELS, r.type), entries: r.entries, points: r.points })),
        },
        {
          key: "orders-by-status",
          rows: data.ordersByStatus.map((r) => ({
            status: label(ORDER_STATUS_LABELS, r.status),
            orders: r.orders,
            points: r.points,
          })),
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every figure is a count or total from database records. Recycling and composting outcomes are not shown,
          because no verified downstream processing records exist yet. The zone filter applies to reports and complaints only.
        </p>

        <form action="/admin/analytics" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className="mb-1 block text-sm font-medium">From</label>
            <input id="from" name="from" type="date" defaultValue={range.fromStr || from}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-sm font-medium">To</label>
            <input id="to" name="to" type="date" defaultValue={range.toStr || to}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone</label>
            <select id="zone" name="zone" defaultValue={zoneId}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
            Apply
          </button>
        </form>

        {range.error && (
          <div className="mt-4">
            <ErrorNotice>{range.error}</ErrorNotice>
          </div>
        )}
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Analytics could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && (
          <p className="mt-3 text-xs text-gray-600">
            Showing {range.fromStr} to {range.toStr} ({range.days} days, UTC).
          </p>
        )}
      </section>

      {data && (
        <ul className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Average time to first staff decision on a report" value={hoursText(data.reviewHours)} />
          <StatCard label="Average time to resolve a complaint" value={hoursText(data.resolutionHours)} />
        </ul>
      )}

      {sections.map((s) => (
        <section key={s.key} className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{DATASETS[s.key].label}</h2>
            {canExport && (
              <Link href={exportHref(s.key)} className="text-sm font-semibold text-emerald-800 underline">
                Download CSV
              </Link>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">{DATASETS[s.key].description}</p>
          <div className="mt-3">
            {s.rows.length === 0 ? (
              <EmptyState>No records in this range.</EmptyState>
            ) : (
              <SimpleTable columns={DATASETS[s.key].columns} rows={s.rows} caption={DATASETS[s.key].label} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
