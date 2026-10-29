import AdminLoginForm from "@/components/forms/AdminLoginForm";

export const metadata = { title: "Admin Login | ECO-CLEAN" };

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-emerald-900">Staff sign-in</h1>
      <p className="mb-6 text-sm text-gray-700">
        Only staff accounts can open the Control Center. Multi-factor
        authentication is not configured yet.
      </p>
      <AdminLoginForm />
    </main>
  );
}
