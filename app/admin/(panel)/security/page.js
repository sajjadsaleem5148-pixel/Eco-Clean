import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "My Security | ECO-CLEAN" };

export default async function AdminSecurityPage() {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Security</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user.email} ({user.role})</p>
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Multi-factor authentication is not configured yet.
        </p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
