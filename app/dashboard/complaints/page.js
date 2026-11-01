import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";

export const metadata = { title: "My Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyComplaintsPage() {
  const user = await requireRole(["RESIDENT"]);

  let complaints = [];
  let loadError = false;
  try {
    await connectDB();
    // Hamesha apni complaints: reporter server ke session se aata hai.
    complaints = await Complaint.find({ reporter: user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("ticketNumber category status createdAt")
      .lean();
  } catch (err) {
    console.error("Load complaints failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">My Complaints</h1>
        <Link href="/complaints" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          New complaint
        </Link>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Complaints could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && complaints.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          You have not submitted any complaints yet.
        </p>
      )}

      {complaints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Ticket</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/dashboard/complaints/" + c.ticketNumber} className="font-semibold text-emerald-800 underline">
                      {c.ticketNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{COMPLAINT_CATEGORIES[c.category] || c.category}</td>
                  <td className="py-2 pr-4">{COMPLAINT_STATUS_LABELS[c.status] || c.status}</td>
                  <td className="py-2">{formatDateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
