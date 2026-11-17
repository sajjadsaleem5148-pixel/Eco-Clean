import { requirePermission } from "@/lib/auth/guards";
import { ROLES, PERMISSIONS, hasPermission } from "@/lib/permissions/roles";
import { ROLE_LABELS } from "@/lib/userAdmin";

export const metadata = { title: "Roles and Permissions | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requirePermission("admins.manage");

  const rows = Object.values(ROLES).map((role) => ({
    role: role,
    permissions: PERMISSIONS.filter((p) => hasPermission(role, p)),
  }));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Roles and Permissions</h1>
      <p className="mt-1 text-sm text-gray-600">
        This list is read-only. Roles and permissions are defined in the application code, so changing them needs a
        code change and a new deployment. Every action is also checked on the server, whatever a page shows.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th scope="col" className="py-2 pr-4">Role</th>
              <th scope="col" className="py-2 pr-4">Permissions</th>
              <th scope="col" className="py-2">Permissions held</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role} className="border-b border-gray-100 align-top">
                <td className="py-2 pr-4 font-medium">{ROLE_LABELS[r.role] || r.role}</td>
                <td className="py-2 pr-4 text-gray-800">
                  {r.permissions.length === 0
                    ? "No admin permissions. This role only uses its own portal."
                    : r.permissions.join(", ")}
                </td>
                <td className="py-2">{r.permissions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
