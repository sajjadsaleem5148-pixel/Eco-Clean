import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { STAFF_ROLES, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/userAdmin";
import { StaffForm, RoleForm, SuspendForm, ReactivateForm } from "@/components/forms/UserForms";

export const metadata = { title: "Admin Staff | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const me = await requirePermission("admins.manage");

  let staff = [];
  let loadError = false;
  try {
    await connectDB();
    staff = await User.find({ role: { $in: ADMIN_ROLES }, deletedAt: null })
      .sort({ createdAt: 1 })
      .select("name email role status suspensionReason isRootAdmin createdAt")
      .lean();
  } catch (err) {
    console.error("Load staff failed:", err.message);
    loadError = true;
  }

  const roles = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Admin Staff</h1>
        <p className="mt-1 text-sm text-gray-600">
          The root Super Admin cannot be changed or suspended here, and nobody can make another Super Admin from this page.
          Changing a role or suspending an account ends that person&apos;s sessions.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Staff could not be loaded. The database may be unavailable.
          </p>
        )}

        {staff.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[50rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Email</th>
                  <th scope="col" className="py-2 pr-4">Role</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Created</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const id = s._id.toString();
                  const isMe = id === me.id;
                  const protectedAccount = s.isRootAdmin || s.role === "SUPER_ADMIN";
                  const canEdit = !protectedAccount && !isMe;
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">
                        {s.name}
                        {isMe && <span className="ml-2 text-xs text-gray-600">(you)</span>}
                        {s.isRootAdmin && (
                          <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Root</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{s.email}</td>
                      <td className="py-2 pr-4">{ROLE_LABELS[s.role] || s.role}</td>
                      <td className="py-2 pr-4">
                        {USER_STATUS_LABELS[s.status] || s.status}
                        {s.status === "SUSPENDED" && s.suspensionReason && (
                          <span className="block text-xs text-gray-600">Reason: {s.suspensionReason}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(s.createdAt)}</td>
                      <td className="py-2">
                        {!canEdit && <span className="text-xs text-gray-600">Protected</span>}
                        {canEdit && (
                          <div className="space-y-2">
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Change role</summary>
                              <RoleForm userId={id} roles={roles} current={s.role} />
                            </details>
                            {s.status === "ACTIVE" && (
                              <details>
                                <summary className="cursor-pointer text-sm font-semibold text-red-800">Suspend</summary>
                                <SuspendForm userId={id} />
                              </details>
                            )}
                            {s.status === "SUSPENDED" && (
                              <details>
                                <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                                <ReactivateForm userId={id} />
                              </details>
                            )}
                          </div>
                        )}
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
        <h2 className="mb-1 text-lg font-semibold">Create a staff account</h2>
        <p className="mb-4 text-sm text-gray-600">
          No email is sent. Give the temporary password to the person yourself; they can change it under My Security.
        </p>
        <StaffForm roles={roles} />
      </section>
    </div>
  );
}
