import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import CollectorForm from "@/components/forms/CollectorForm";

export const metadata = { title: "Collectors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminCollectorsPage() {
  await requirePermission("collections.manage");

  let collectors = [];
  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    const [c, z] = await Promise.all([
      User.find({ role: "COLLECTOR", deletedAt: null }).sort({ createdAt: -1 }).populate("serviceZone", "name").lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
    ]);
    collectors = c;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load collectors failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Collectors</h1>
        <p className="mt-1 text-sm text-gray-600">Collector accounts can only be created by authorized staff.</p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Collectors could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && collectors.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No collectors yet. Create the first one below.
          </p>
        )}
        {collectors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Email</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {collectors.map((c) => (
                  <tr key={c._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4">{c.email}</td>
                    <td className="py-2 pr-4">{c.serviceZone ? c.serviceZone.name : "-"}</td>
                    <td className="py-2">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a collector account</h2>
        {zones.length === 0 ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Create a service zone first.
          </p>
        ) : (
          <CollectorForm zones={zones} />
        )}
      </section>
    </div>
  );
}
