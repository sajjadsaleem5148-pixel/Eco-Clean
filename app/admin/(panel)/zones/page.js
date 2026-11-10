import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import { requirePermission } from "@/lib/auth/guards";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import ZoneForm, { EditZoneForm, DeactivateZoneForm, ReactivateZoneForm } from "@/components/forms/ZoneForm";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Service Zones | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  await requirePermission("collections.manage");

  let zones = [];
  const openByZone = {};
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
    const counts = await WasteReport.aggregate([
      { $match: { deletedAt: null, status: { $nin: CLOSED_STATUSES } } },
      { $group: { _id: "$serviceZone", count: { $sum: 1 } } },
    ]);
    counts.forEach((c) => {
      openByZone[String(c._id)] = c.count;
    });
  } catch (err) {
    console.error("Load zones failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Service Zones</h1>
        <p className="mt-1 text-sm text-gray-600">
          Zones decide where services are available and how often collection is targeted. An inactive zone no longer
          appears on the report form. A zone with open reports cannot be deactivated.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Zones could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && zones.length === 0 && (
          <div className="mt-4">
            <EmptyState>No zones yet. Create the first one below.</EmptyState>
          </div>
        )}

        {zones.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Target (days)</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2 pr-4">Created</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => {
                  const id = z._id.toString();
                  const plain = {
                    id,
                    name: z.name,
                    description: z.description || "",
                    targetCollectionEveryDays: z.targetCollectionEveryDays,
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{z.name}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={z.status} label={ZONE_STATUS_LABELS[z.status]} />
                      </td>
                      <td className="py-2 pr-4">{z.targetCollectionEveryDays}</td>
                      <td className="py-2 pr-4">{openByZone[id] || 0}</td>
                      <td className="py-2 pr-4">{new Date(z.createdAt).toISOString().slice(0, 10)}</td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditZoneForm zone={plain} />
                          </details>
                          {z.status === "ACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-red-800">Deactivate</summary>
                              <DeactivateZoneForm zoneId={id} />
                            </details>
                          )}
                          {z.status === "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                              <ReactivateZoneForm zoneId={id} />
                            </details>
                          )}
                        </div>
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
        <h2 className="mb-4 text-lg font-semibold">Create a zone</h2>
        <ZoneForm />
      </section>
    </div>
  );
}
