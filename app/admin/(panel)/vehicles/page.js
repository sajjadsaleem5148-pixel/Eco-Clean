import connectDB from "@/lib/db/connect";
import Vehicle from "@/models/Vehicle";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_BADGE,
  VEHICLE_REASON_REQUIRED,
  TARGET_LABELS,
  vehicleTargets,
} from "@/lib/vehicleRules";
import VehicleForm, { EditVehicleForm, VehicleStatusForm } from "@/components/forms/VehicleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Vehicles | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/vehicles" + (status ? "?status=" + status : "");
}

export default async function AdminVehiclesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = VEHICLE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let vehicles = [];
  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    const [v, z] = await Promise.all([
      Vehicle.find(filter).sort({ createdAt: -1 }).limit(200).populate("serviceZone", "name").lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).select("name").lean(),
    ]);
    vehicles = v;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load vehicles failed:", err.message);
    loadError = true;
  }

  const types = Object.entries(VEHICLE_TYPES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    VEHICLE_STATUSES.map((s) => ({ label: VEHICLE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Vehicles</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is the fleet record. Vehicles are not linked to schedules or jobs yet. A retired vehicle cannot be edited
          or returned to service.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Vehicles could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && vehicles.length === 0 && (
          <div className="mt-4">
            <EmptyState>No vehicles match this filter.</EmptyState>
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Plate</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Capacity (kg)</th>
                  <th scope="col" className="py-2 pr-4">Home zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const id = v._id.toString();
                  const plain = {
                    id: id,
                    plate: v.plate,
                    type: v.type,
                    capacityKg: v.capacityKg,
                    zoneId: v.serviceZone ? v.serviceZone._id.toString() : "",
                    notes: v.notes || "",
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{v.plate}</td>
                      <td className="py-2 pr-4">{VEHICLE_TYPES[v.type] || v.type}</td>
                      <td className="py-2 pr-4">{v.capacityKg}</td>
                      <td className="py-2 pr-4">{v.serviceZone ? v.serviceZone.name : "Any zone"}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={VEHICLE_BADGE[v.status]} label={VEHICLE_STATUS_LABELS[v.status]} />
                        {v.statusReason && <span className="mt-1 block text-xs text-gray-600">Reason: {v.statusReason}</span>}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {v.status !== "RETIRED" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditVehicleForm vehicle={plain} types={types} zones={zones} />
                            </details>
                          )}
                          {vehicleTargets(v.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "RETIRED" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {TARGET_LABELS[t]}
                              </summary>
                              <VehicleStatusForm
                                vehicleId={id}
                                target={t}
                                label={TARGET_LABELS[t]}
                                needsReason={VEHICLE_REASON_REQUIRED.includes(t)}
                                danger={t === "RETIRED"}
                              />
                            </details>
                          ))}
                          {v.status === "RETIRED" && <span className="text-xs text-gray-600">Retired</span>}
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
        <h2 className="mb-4 text-lg font-semibold">Add a vehicle</h2>
        <VehicleForm types={types} zones={zones} />
      </section>
    </div>
  );
}
