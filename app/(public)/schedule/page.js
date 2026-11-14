import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import "@/models/ServiceZone";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Collection Schedule | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    // Only confirmed schedules are public. The collector's name is never selected.
    const all = await CollectionSchedule.find({ status: "CONFIRMED" })
      .populate({ path: "serviceZone", select: "name status deletedAt" })
      .select("serviceZone weekday startTime endTime")
      .lean();
    schedules = all.filter((s) => s.serviceZone && s.serviceZone.status === "ACTIVE" && !s.serviceZone.deletedAt);
  } catch (err) {
    console.error("Load public schedule failed:", err.message);
    loadError = true;
  }

  const byZone = {};
  schedules.forEach((s) => {
    const name = s.serviceZone.name;
    if (!byZone[name]) byZone[name] = [];
    byZone[name].push(s);
  });
  const zoneNames = Object.keys(byZone).sort();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Collection Schedule</h1>
      <p className="mt-2 text-sm text-gray-700">
        Only schedules that staff have confirmed with a responsible collector are listed here. Times are a service
        target, not a guarantee, and can change because of staff, vehicle or disposal capacity.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>The schedule is temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && zoneNames.length === 0 && (
        <div className="mt-6">
          <EmptyState>No collection schedules have been confirmed yet.</EmptyState>
        </div>
      )}

      {zoneNames.length > 0 && (
        <div className="mt-6 space-y-6">
          {zoneNames.map((name) => (
            <section key={name} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{name}</h2>
              <ul className="mt-3 space-y-1 text-sm text-gray-800">
                {byZone[name]
                  .slice()
                  .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
                  .map((s) => (
                    <li key={s._id.toString()}>
                      {weekdayLabel(s.weekday)}: {formatWindow(s.startTime, s.endTime)}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
