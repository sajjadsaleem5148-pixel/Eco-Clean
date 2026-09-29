import Link from "next/link";
import { Eye } from "lucide-react";

export default function PickupTable({ pickups = [] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      
      {/* Table Header */}
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Recent Pickup Requests
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Latest waste collection requests
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Waste Type</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {pickups.length > 0 ? (
              pickups.map((pickup) => (
                <tr
                  key={pickup._id}
                  className="hover:bg-gray-50"
                >
                  {/* User */}
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">
                      {pickup.user?.name || "Unknown User"}
                    </p>

                    <p className="text-xs text-gray-500">
                      {pickup.user?.phone || "No phone"}
                    </p>
                  </td>

                  {/* Waste Type */}
                  <td className="px-5 py-4 text-gray-600">
                    {pickup.wasteType}
                  </td>

                  {/* Date */}
                  <td className="px-5 py-4 text-gray-600">
                    {pickup.pickupDate
                      ? new Date(
                          pickup.pickupDate
                        ).toLocaleDateString()
                      : "-"}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        pickup.status === "Completed"
                          ? "bg-green-100 text-green-700"
                          : pickup.status === "Cancelled"
                          ? "bg-red-100 text-red-700"
                          : pickup.status === "On the Way"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {pickup.status}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/pickups/${pickup._id}`}
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
                  No pickup requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}