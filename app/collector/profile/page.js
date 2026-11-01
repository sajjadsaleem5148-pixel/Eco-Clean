import { requireRole } from "@/lib/auth/guards";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "My Profile | ECO-CLEAN" };

export default async function CollectorProfilePage() {
  const user = await requireRole(["COLLECTOR"]);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-2 text-sm text-gray-700">Name: {user.name}</p>
        <p className="text-sm text-gray-700">Email: {user.email}</p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-semibold">Change password</h2>
        <p className="mb-4 text-sm text-gray-600">
          If you received a temporary password from an administrator, please change it now.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
