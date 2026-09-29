import Link from "next/link";
import { Eye } from "lucide-react";

export default function ComplaintTable({ complaints = [] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

      {/* Header */}
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Recent Complaints
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Manage citizen complaints
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">Subject</th>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Location</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {complaints.length > 0 ? (
              complaints.map((complaint) => (
                <tr
                  key={complaint._id}
                  className="hover:bg-gray-50"
                >
                  {/* Subject */}
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">
                      {complaint.subject}
                    </p>
                  </td>

                  {/* User */}
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-700">
                      {complaint.user?.name || "Unknown User"}
                    </p>

                    <p className="text-xs text-gray-500">
                      {complaint.user?.email || "-"}
                    </p>
                  </td>

                  {/* Location */}
                  <td className="px-5 py-4 text-gray-600">
                    {complaint.location || "-"}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        complaint.status === "Resolved"
                          ? "bg-green-100 text-green-700"
                          : complaint.status === "Rejected"
                          ? "bg-red-100 text-red-700"
                          : complaint.status === "In Progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {complaint.status}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/complaints/${complaint._id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      <Eye size={15} />
                      View
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="5"
                  className="px-5 py-10 text-center text-gray-500"
                >
                  No complaints found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}