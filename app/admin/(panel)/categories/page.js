import { redirect } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import WasteReport from "@/models/WasteReport";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { CATEGORY_STATUS_LABELS, safeColor, textColorFor } from "@/lib/categoryRules";
import CategoryForm, {
  EditCategoryForm,
  DeactivateCategoryForm,
  ReactivateCategoryForm,
} from "@/components/forms/CategoryForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Waste Categories | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  // Editing text needs content.publish. Activating or deactivating needs collections.manage.
  const canEdit = hasPermission(user.role, "content.publish");
  const canStatus = hasPermission(user.role, "collections.manage");
  if (!canEdit && !canStatus) redirect("/admin");

  let categories = [];
  const openByCategory = {};
  let loadError = false;
  try {
    await connectDB();
    categories = await WasteCategory.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await WasteReport.aggregate([
      { $match: { deletedAt: null, status: { $nin: CLOSED_STATUSES } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    counts.forEach((c) => {
      openByCategory[String(c._id)] = c.count;
    });
  } catch (err) {
    console.error("Load categories failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Waste Categories</h1>
        <p className="mt-1 text-sm text-gray-600">
          Categories appear on the public Waste Segregation guide and on the report form while they are active.
          These lists are examples that local rules may change, not universal disposal rules. A category used by open
          reports cannot be deactivated.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Categories could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && categories.length === 0 && (
          <div className="mt-4">
            <EmptyState>No categories yet. Create the first one below.</EmptyState>
          </div>
        )}

        {categories.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Order</th>
                  <th scope="col" className="py-2 pr-4">Accepted items</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const id = c._id.toString();
                  const color = safeColor(c.color);
                  const plain = {
                    id: id,
                    name: c.name,
                    description: c.description || "",
                    color: color,
                    sortOrder: c.sortOrder || 0,
                    accepted: (c.acceptedMaterials || []).join("\n"),
                    prohibited: (c.prohibitedMaterials || []).join("\n"),
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4">
                        <span
                          style={{ backgroundColor: color, color: textColorFor(color) }}
                          className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
                        >
                          {c.name}
                        </span>
                        <span className="mt-1 block text-xs text-gray-600">Key: {c.key}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={c.status} label={CATEGORY_STATUS_LABELS[c.status]} />
                      </td>
                      <td className="py-2 pr-4">{c.sortOrder || 0}</td>
                      <td className="py-2 pr-4">{(c.acceptedMaterials || []).length}</td>
                      <td className="py-2 pr-4">{openByCategory[id] || 0}</td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {canEdit && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditCategoryForm category={plain} />
                            </details>
                          )}
                          {canStatus && c.status === "ACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-red-800">Deactivate</summary>
                              <DeactivateCategoryForm categoryId={id} />
                            </details>
                          )}
                          {canStatus && c.status === "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                              <ReactivateCategoryForm categoryId={id} />
                            </details>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Create a category</h2>
          <CategoryForm />
        </section>
      )}
    </div>
  );
}
