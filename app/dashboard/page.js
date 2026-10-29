import { requireRole } from "@/lib/auth/guards";

export const metadata = { title: "Dashboard | ECO-CLEAN" };

export default async function DashboardPage() {
  const user = await requireRole(["RESIDENT"]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-bold text-emerald-900">Welcome, {user.name}</h1>
      <p className="mt-2 text-sm text-gray-700">Email: {user.email}</p>
      <p className="text-sm text-gray-700">Role: {user.role}</p>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Your reports, collections and Green Points will appear here once those features are built.
      </p>
    </section>
  );
}
