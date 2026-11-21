import Link from "next/link";
import { requirePermission } from "@/lib/auth/guards";
import { getZoneCoverage } from "@/services/zoneCoverage";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Households by Zone | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminHouseholdsPage() {
  await requirePermission("users.read");

  let data = null;
  let loadError = false;
  try {
    data = await getZoneCoverage();
  } catch (err) {
    console.error("Load zone coverage failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Households by Zone</h1>
      <p className="mt-1 text-sm text-gray-600">
        This page shows counts only. A household here means an active resident who chose a service zone. Full household
        records with addresses or family members do not exist yet, and no resident is named on this page. Only active
        residents are counted.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Coverage could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}

      {data && (
        <p className="mt-3 text-sm text-gray-800">
          Active residents: {data.totalResidents}. Residents who have not chosen a zone: {data.residentsWithoutZone}.
        </p>
      )}

      {data && data.rows.length === 0 && (
        <div className="mt-4">
          <EmptyState>
            No zones exist yet.{" "}
            <Link href="/admin/zones" className="font-semibold text-emerald-800 underline">Create a zone</Link>
          </EmptyState>
        </div>
      )}

      {data && data.rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Residents</th>
                <th scope="col" className="py-2 pr-4">Neighborhoods</th>
                <th scope="col" className="py-2 pr-4">Active collectors</th>
                <th scope="col" className="py-2 pr-4">Confirmed schedules</th>
                <th scope="col" className="py-2 pr-4">Open reports</th>
                <th scope="col" className="py-2">Gaps</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} label={ZONE_STATUS_LABELS[r.status]} />
                  </td>
                  <td className="py-2 pr-4">{r.residents}</td>
                  <td className="py-2 pr-4">{r.neighborhoods}</td>
                  <td className="py-2 pr-4">{r.collectors}</td>
                  <td className="py-2 pr-4">{r.schedules}</td>
                  <td className="py-2 pr-4">{r.openReports}</td>
                  <td className="py-2">
                    {r.gaps.length === 0 ? (
                      <span className="text-gray-500">None</span>
                    ) : (
                      <ul className="space-y-1 text-amber-900">
                        {r.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
