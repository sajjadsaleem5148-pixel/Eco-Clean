import connectDB from "@/lib/db/connect";
import { requireRole } from "@/lib/auth/guards";
import { confirmedForCollector } from "@/services/scheduleQueries";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Schedule | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorSchedulePage() {
  const user = await requireRole(["COLLECTOR"]);

  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    // Only this collector's own confirmed schedules; the id comes from the server session.
    schedules = await confirmedForCollector(user.id);
  } catch (err) {
    console.error("Load collector schedule failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
      <p className="mt-1 text-sm text-gray-600">
        These are the weekly collection windows that staff confirmed for you.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your schedule could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && schedules.length === 0 && (
        <div className="mt-4">
          <EmptyState>No schedule has been confirmed for you yet.</EmptyState>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Day</th>
                <th scope="col" className="py-2 pr-4">Window</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 font-medium">{weekdayLabel(s.weekday)}</td>
                  <td className="py-2 pr-4">{formatWindow(s.startTime, s.endTime)}</td>
                  <td className="py-2 pr-4">{s.zoneName}</td>
                  <td className="py-2">{s.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
