import { getImpactFigures } from "@/services/impact";
import { formatCount, isAllZero } from "@/lib/impactFormat";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Our Impact | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function show(value) {
  return value === null || value === undefined ? null : formatCount(value);
}

export default async function ImpactPage() {
  const f = await getImpactFigures();
  const unavailable = Object.keys(f).every((k) => f[k] === null);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Our Impact</h1>
      <p className="mt-2 text-sm text-gray-700">
        These are live counts from the ECO-CLEAN database. They are not estimates. Recycling and composting outcomes
        are not shown, because no verified processing records exist yet.
      </p>

      {unavailable && (
        <div className="mt-6">
          <ErrorNotice>The figures are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}

      {!unavailable && isAllZero(f) && (
        <div className="mt-6">
          <EmptyState>The platform has just started, so every figure is still zero.</EmptyState>
        </div>
      )}

      {!unavailable && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Garbage reports collected" value={show(f.reportsCollected)} />
          <StatCard label="Garbage reports submitted" value={show(f.reportsSubmitted)} />
          <StatCard label="Active service zones" value={show(f.activeZones)} />
          <StatCard label="Active residents" value={show(f.activeResidents)} />
          <StatCard label="Reward orders completed" value={show(f.ordersCompleted)} />
          <StatCard label="Green Points earned in total" value={show(f.pointsEarned)} />
        </ul>
      )}
    </main>
  );
}
