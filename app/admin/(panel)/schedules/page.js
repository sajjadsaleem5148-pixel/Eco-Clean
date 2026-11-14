import Link from "next/link";
import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  WEEKDAYS,
  scheduleTargets,
  weekdayLabel,
  formatWindow,
} from "@/lib/scheduleStatus";
import { ScheduleForm, ConfirmScheduleForm, CancelScheduleForm } from "@/components/forms/ScheduleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Collection Schedules | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/schedules" + (status ? "?status=" + status : "");
}

export default async function AdminSchedulesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = SCHEDULE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = {};
  if (status) filter.status = status;

  let schedules = [];
  let zones = [];
  let collectors = [];
  let loadError = false;
  try {
    await connectDB();
    const [s, z, c] = await Promise.all([
      CollectionSchedule.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("serviceZone", "name")
        .populate("collector", "name")
        .lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
      User.find({ role: "COLLECTOR", status: "ACTIVE", deletedAt: null, serviceZone: { $ne: null } })
        .sort({ name: 1 })
        .select("name serviceZone")
        .lean(),
    ]);
    schedules = s;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    collectors = c.map((x) => ({ id: x._id.toString(), name: x.name, zoneId: x.serviceZone.toString() }));
  } catch (err) {
    console.error("Load schedules failed:", err.message);
    loadError = true;
  }

  const weekdays = WEEKDAYS.map((label, value) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    SCHEDULE_STATUSES.map((s) => ({ label: SCHEDULE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Collection Schedules</h1>
        <p className="mt-1 text-sm text-gray-600">
          A schedule is public only after it is confirmed with a responsible collector. Holidays, service interruptions
          and teams or vehicles are not part of this version.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Schedules could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && schedules.length === 0 && (
          <div className="mt-4">
            <EmptyState>No schedules match this filter.</EmptyState>
          </div>
        )}

        {schedules.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Day</th>
                  <th scope="col" className="py-2 pr-4">Window</th>
                  <th scope="col" className="py-2 pr-4">Collector</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const id = s._id.toString();
                  const targets = scheduleTargets(s.status);
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{s.serviceZone ? s.serviceZone.name : "-"}</td>
                      <td className="py-2 pr-4">{weekdayLabel(s.weekday)}</td>
                      <td className="py-2 pr-4">{formatWindow(s.startTime, s.endTime)}</td>
                      <td className="py-2 pr-4">{s.collector ? s.collector.name : "-"}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={s.status} label={SCHEDULE_STATUS_LABELS[s.status]} />
                        {s.status === "CANCELLED" && s.cancelReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {s.cancelReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {targets.includes("CONFIRMED") && <ConfirmScheduleForm scheduleId={id} />}
                        {targets.includes("CANCELLED") && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm font-semibold text-red-800">Cancel</summary>
                            <CancelScheduleForm scheduleId={id} />
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a schedule</h2>
        {zones.length === 0 ? (
          <EmptyState>
            No active zones. <Link href="/admin/zones" className="font-semibold text-emerald-800 underline">Create a zone</Link> first.
          </EmptyState>
        ) : (
          <ScheduleForm zones={zones} collectors={collectors} weekdays={weekdays} />
        )}
      </section>
    </div>
  );
}
