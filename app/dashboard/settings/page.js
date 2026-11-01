import { requireRole } from "@/lib/auth/guards";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "Settings | ECO-CLEAN" };

export default async function ResidentSettingsPage() {
  const user = await requireRole(["RESIDENT"]);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user.email}</p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
