import { requirePermission } from "@/lib/auth/guards";
import { getZoneCoverage } from "@/services/zoneCoverage";
import { INTEGRATIONS, envStatus } from "@/lib/integrationStatus";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Operations Map | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminOperationsMapPage() {
  await requirePermission("reports.read");
  const maps = INTEGRATIONS.find((i) => i.key === "maps");
  const info = envStatus(maps, process.env);

  let data = null;
  let loadError = false;
  try {
    data = await getZoneCoverage();
  } catch (err) {
    console.error("Load operations overview failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Operations Map</h1>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          There is no map. Reports do not store a map location yet, so nothing can be placed on a map. The table below
          shows the same operations by zone in text form.
        </p>
        <p className="mt-3 text-sm text-gray-800">
          Map provider:{" "}
          <StatusBadge
            status={info.configured ? "PENDING" : "DRAFT"}
            label={info.configured ? "Settings found, no feature uses them yet" : "Not configured"}
          />
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Operations by zone</h2>
        {loadError && (
          <div className="mt-3">
            <ErrorNotice>The overview could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && data.rows.length === 0 && (
          <div className="mt-3">
            <EmptyState>No zones exist yet.</EmptyState>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2 pr-4">Active collectors</th>
                  <th scope="col" className="py-2">Confirmed schedules</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={r.status} label={ZONE_STATUS_LABELS[r.status]} />
                    </td>
                    <td className="py-2 pr-4">{r.openReports}</td>
                    <td className="py-2 pr-4">{r.collectors}</td>
                    <td className="py-2">{r.schedules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
