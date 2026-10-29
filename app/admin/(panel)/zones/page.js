import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import ZoneForm from "@/components/forms/ZoneForm";

export const metadata = { title: "Service Zones | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  await requirePermission("collections.manage");

  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load zones failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Service Zones</h1>
        <p className="mt-1 text-sm text-gray-600">
          Zones decide where services are available and how often collection is targeted.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Zones could not be loaded. The database may be unavailable.
          </p>
        )}

        {!loadError && zones.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No zones yet. Create the first one below.
          </p>
        )}

        {zones.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Target (days)</th>
                  <th scope="col" className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{z.name}</td>
                    <td className="py-2 pr-4">{z.status}</td>
                    <td className="py-2 pr-4">{z.targetCollectionEveryDays}</td>
                    <td className="py-2">{new Date(z.createdAt).toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
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
