import connectDB from "@/lib/db/connect";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteCategory from "@/models/WasteCategory";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { RuleForm } from "@/components/forms/PointsForms";

export const metadata = { title: "Points Earning Rules | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function PointsRulesPage() {
  const user = await requirePermission("points.read");
  const canEdit = hasPermission(user.role, "points.adjust");

  let rules = [];
  let categories = [];
  let loadError = false;
  try {
    await connectDB();
    const [r, c] = await Promise.all([
      PointsEarningRule.find({}).populate("category", "name").lean(),
      WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1 }).lean(),
    ]);
    rules = r;
    categories = c.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load rules failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Points Earning Rules</h1>
        <p className="mt-1 text-sm text-gray-600">
          Points are awarded only for verified, collected reports. Without an active rule for a category, no points can be awarded.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Rules could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && rules.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No earning rules yet. No points can be awarded until one is created.
          </p>
        )}
        {rules.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{r.category ? r.category.name : "-"}</td>
                    <td className="py-2 pr-4">{r.points}</td>
                    <td className="py-2">{r.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Create or update a rule</h2>
          {categories.length === 0 ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              No waste categories are available.
            </p>
          ) : (
            <RuleForm categories={categories} />
          )}
        </section>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Your role can view rules but cannot change them.
        </p>
      )}
    </div>
  );
}
