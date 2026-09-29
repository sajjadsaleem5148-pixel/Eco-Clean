import Link from "next/link";
import { Eye } from "lucide-react";

export default function UserTable({ users = [] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      
      {/* Header */}
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Users
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Manage EcoClean users
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {users.length > 0 ? (
              users.map((user) => (
                <tr
                  key={user._id}
                  className="hover:bg-gray-50"
                >
                  {/* Name */}
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">
                      {user.name}
                    </p>
                  </td>

                  {/* Email */}
                  <td className="px-5 py-4 text-gray-600">
                    {user.email}
                  </td>

                  {/* Phone */}
                  <td className="px-5 py-4 text-gray-600">
                    {user.phone || "-"}
                  </td>

                  {/* Role */}
                  <td className="px-5 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : user.role === "collector"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/users/${user._id}`}
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
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}