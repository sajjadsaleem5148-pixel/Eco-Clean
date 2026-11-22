import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requireRole } from "@/lib/auth/guards";
import { confirmedForZone } from "@/services/scheduleQueries";
import { weekdayLabel, formatWindow } from "@/lib/scheduleStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Collections | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyCollectionsPage() {
  const user = await requireRole(["RESIDENT"]);

  let hasZone = false;
  let zone = null;
  let schedules = [];
  let loadError = false;
  try {
    await connectDB();
    const me = await User.findById(user.id).select("serviceZone").lean();
    if (me && me.serviceZone) {
      hasZone = true;
      const result = await confirmedForZone(me.serviceZone);
      zone = result.zone;
      schedules = result.schedules;
    }
  } catch (err) {
    console.error("Load collections failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Collections</h1>
      <p className="mt-1 text-sm text-gray-600">
        Only schedules that staff confirmed with a responsible collector are shown. Times are a service target, not a
        guarantee, and can change.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your schedule could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}

      {!loadError && !hasZone && (
        <div className="mt-4">
          <EmptyState>
            You have not chosen a service zone yet.{" "}
            <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Choose your zone</Link>
          </EmptyState>
        </div>
      )}

      {!loadError && hasZone && !zone && (
        <div className="mt-4">
          <EmptyState>
            Your saved zone is not active.{" "}
            <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Choose another zone</Link>
          </EmptyState>
        </div>
      )}

      {!loadError && zone && schedules.length === 0 && (
        <div className="mt-4">
          <EmptyState>No collection schedule has been confirmed for {zone.name} yet.</EmptyState>
        </div>
      )}

      {zone && schedules.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">{zone.name}</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-800">
            {schedules.map((s) => (
              <li key={s.id}>{weekdayLabel(s.weekday)}: {formatWindow(s.startTime, s.endTime)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
