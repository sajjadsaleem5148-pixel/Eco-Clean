import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "My Jobs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorJobsPage() {
  const user = await requireRole(["COLLECTOR"]);

  let jobs = [];
  let loadError = false;
  try {
    await connectDB();
    // Sirf wohi jobs jo is collector ko assign hui hain.
    jobs = await WasteReport.find({ assignedCollector: user.id, deletedAt: null })
      .sort({ assignedAt: -1 })
      .limit(50)
      .populate("category", "name")
      .populate("serviceZone", "name")
      .select("reportId category serviceZone address status assignedAt")
      .lean();
  } catch (err) {
    console.error("Load jobs failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Jobs</h1>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Jobs could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && jobs.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No jobs have been assigned to you yet.
        </p>
      )}

      {jobs.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Job</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Address</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/collector/jobs/" + j.reportId} className="font-semibold text-emerald-800 underline">
                      {j.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{j.category ? j.category.name : "-"}</td>
                  <td className="py-2 pr-4">{j.address}</td>
                  <td className="py-2 pr-4">{STATUS_LABELS[j.status] || j.status}</td>
                  <td className="py-2">{j.assignedAt ? formatDateTime(j.assignedAt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
