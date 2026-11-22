import connectDB from "@/lib/db/connect";
import CollectionRoute from "@/models/CollectionRoute";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  ROUTE_STATUSES,
  ROUTE_STATUS_LABELS,
  ROUTE_REASON_REQUIRED,
  routeTargets,
  routeTargetLabel,
} from "@/lib/routeRules";
import RouteForm, { EditRouteForm, RouteStatusForm } from "@/components/forms/RouteForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Routes | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/routes" + (status ? "?status=" + status : "");
}

export default async function AdminRoutesPage({ searchParams }) {
  await requirePermission("collections.manage");
  const sp = await searchParams;
  const status = ROUTE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let routes = [];
  let zones = [];
  let collectors = [];
  let loadError = false;
  try {
    await connectDB();
    const [r, z, c] = await Promise.all([
      CollectionRoute.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("serviceZone", "name status")
        .populate("collector", "name status")
        .lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).select("name").lean(),
      User.find({ role: "COLLECTOR", status: "ACTIVE", deletedAt: null, serviceZone: { $ne: null } })
        .sort({ name: 1 })
        .select("name serviceZone")
        .lean(),
    ]);
    routes = r;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    collectors = c.map((x) => ({ id: x._id.toString(), name: x.name, zoneId: x.serviceZone.toString() }));
  } catch (err) {
    console.error("Load routes failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    ROUTE_STATUSES.map((s) => ({ label: ROUTE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <p className="mt-1 text-sm text-gray-600">
          A route is a planning record: an ordered list of stops and one responsible collector in a zone. Routes are not
          linked to schedules, jobs or reports yet, and no map or distance is calculated. An inactive route cannot be edited.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Routes could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && routes.length === 0 && (
          <div className="mt-4">
            <EmptyState>No routes match this filter.</EmptyState>
          </div>
        )}

        {routes.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Route</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Collector</th>
                  <th scope="col" className="py-2 pr-4">Stops</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => {
                  const id = r._id.toString();
                  const zoneId = r.serviceZone ? r.serviceZone._id.toString() : "";
                  const zoneName = r.serviceZone ? r.serviceZone.name : "-";
                  const stops = r.stops || [];
                  const plain = {
                    id: id,
                    name: r.name,
                    collectorId: r.collector ? r.collector._id.toString() : "",
                    stops: stops.join("\n"),
                    zoneName: zoneName,
                  };
                  const zoneCollectors = collectors.filter((c) => c.zoneId === zoneId);
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4">
                        {zoneName}
                        {r.serviceZone && r.serviceZone.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Zone is inactive</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {r.collector ? r.collector.name : <span className="text-gray-500">None</span>}
                        {r.collector && r.collector.status !== "ACTIVE" && (
                          <span className="block text-xs text-amber-900">Collector is not active</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {stops.length}
                        {stops.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Show stops</summary>
                            <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs text-gray-800">
                              {stops.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={r.status} label={ROUTE_STATUS_LABELS[r.status]} />
                        {r.status === "INACTIVE" && r.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {r.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {r.status !== "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditRouteForm route={plain} collectors={zoneCollectors} />
                            </details>
                          )}
                          {routeTargets(r.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {routeTargetLabel(r.status, t)}
                              </summary>
                              <RouteStatusForm
                                routeId={id}
                                target={t}
                                label={routeTargetLabel(r.status, t)}
                                needsReason={ROUTE_REASON_REQUIRED.includes(t)}
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
        <h2 className="mb-4 text-lg font-semibold">Add a route</h2>
        {zones.length === 0 ? (
          <EmptyState>No active zones. Create a zone first.</EmptyState>
        ) : (
          <RouteForm zones={zones} collectors={collectors} />
        )}
      </section>
    </div>
  );
}
