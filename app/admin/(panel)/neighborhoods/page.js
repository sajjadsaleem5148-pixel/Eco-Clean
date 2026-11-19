import connectDB from "@/lib/db/connect";
import Neighborhood from "@/models/Neighborhood";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import {
  NEIGHBORHOOD_STATUSES,
  NEIGHBORHOOD_STATUS_LABELS,
  NEIGHBORHOOD_REASON_REQUIRED,
  neighborhoodTargets,
} from "@/lib/neighborhoodRules";
import NeighborhoodForm, {
  EditNeighborhoodForm,
  NeighborhoodStatusForm,
} from "@/components/forms/NeighborhoodForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Neighborhoods | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(zone, status) {
  const params = new URLSearchParams();
  if (zone) params.set("zone", zone);
  if (status) params.set("status", status);
  const qs = params.toString();
  return "/admin/neighborhoods" + (qs ? "?" + qs : "");
}

function targetLabel(target) {
  return target === "INACTIVE" ? "Deactivate neighborhood" : "Reactivate neighborhood";
}

export default async function AdminNeighborhoodsPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = NEIGHBORHOOD_STATUSES.includes(sp?.status) ? sp.status : null;
  const zoneRaw = typeof sp?.zone === "string" ? sp.zone : "";
  const zoneFilter = /^[a-f\d]{24}$/i.test(zoneRaw) ? zoneRaw : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (zoneFilter) filter.serviceZone = zoneFilter;

  let items = [];
  let allZones = [];
  let loadError = false;
  try {
    await connectDB();
    const [list, zones] = await Promise.all([
      Neighborhood.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("serviceZone", "name status")
        .lean(),
      ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name status").lean(),
    ]);
    items = list;
    allZones = zones;
  } catch (err) {
    console.error("Load neighborhoods failed:", err.message);
    loadError = true;
  }

  const activeZones = allZones.filter((z) => z.status === "ACTIVE").map((z) => ({ id: z._id.toString(), name: z.name }));
  const tabs = [{ label: "All", href: href(zoneFilter, null), active: !status }].concat(
    NEIGHBORHOOD_STATUSES.map((s) => ({
      label: NEIGHBORHOOD_STATUS_LABELS[s],
      href: href(zoneFilter, s),
      active: status === s,
    }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Neighborhoods</h1>
        <p className="mt-1 text-sm text-gray-600">
          A neighborhood belongs to one service zone and cannot be moved to another. Neighborhoods are not linked to
          reports, residents or schedules yet. The same name can be used in different zones.
        </p>

        <form action="/admin/neighborhoods" method="get" className="mt-4 flex flex-wrap items-end gap-3">
          {status && <input type="hidden" name="status" value={status} />}
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone</label>
            <select id="zone" name="zone" defaultValue={zoneFilter}
              className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All zones</option>
              {allZones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
            Apply
          </button>
        </form>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Neighborhoods could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No neighborhoods match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Neighborhood</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => {
                  const id = n._id.toString();
                  const zoneName = n.serviceZone ? n.serviceZone.name : "-";
                  const plain = { id: id, name: n.name, description: n.description || "", zoneName: zoneName };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{n.name}</span>
                        {n.description && <span className="block text-xs text-gray-600">{n.description}</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {zoneName}
                        {n.serviceZone && n.serviceZone.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Zone is inactive</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={n.status} label={NEIGHBORHOOD_STATUS_LABELS[n.status]} />
                        {n.status === "INACTIVE" && n.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {n.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditNeighborhoodForm neighborhood={plain} />
                          </details>
                          {neighborhoodTargets(n.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {targetLabel(t)}
                              </summary>
                              <NeighborhoodStatusForm
                                neighborhoodId={id}
                                target={t}
                                label={targetLabel(t)}
                                needsReason={NEIGHBORHOOD_REASON_REQUIRED.includes(t)}
                                danger={t === "INACTIVE"}
                              />
                            </details>
                          ))}
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
        <h2 className="mb-4 text-lg font-semibold">Add a neighborhood</h2>
        {activeZones.length === 0 ? (
          <EmptyState>No active zones. Create a zone first.</EmptyState>
        ) : (
          <NeighborhoodForm zones={activeZones} />
        )}
      </section>
    </div>
  );
}
