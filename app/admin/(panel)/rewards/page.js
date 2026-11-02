import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { requirePermission } from "@/lib/auth/guards";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS_LABELS,
  PRODUCT_TARGET_LABELS,
  FULFILLMENT_LABELS,
  productTargets,
} from "@/lib/rewardStatus";
import { ProductForm, ProductStatusButton } from "@/components/forms/RewardForms";

export const metadata = { title: "Reward Products | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  await requirePermission("rewards.manage");

  let products = [];
  let loadError = false;
  try {
    await connectDB();
    products = await RewardProduct.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load products failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(PRODUCT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const fulfillments = Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Reward Products</h1>
        <p className="mt-1 text-sm text-gray-600">
          New products start as drafts. Only published products appear in the store. Fresh produce is not available
          until supplier, expiry and storage controls exist.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Products could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && products.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No products yet. Create the first one below.
          </p>
        )}

        {products.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Price</th>
                  <th scope="col" className="py-2 pr-4">Available</th>
                  <th scope="col" className="py-2 pr-4">Reserved</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{p.name}</td>
                    <td className="py-2 pr-4">{PRODUCT_CATEGORIES[p.category] || p.category}</td>
                    <td className="py-2 pr-4">{p.pointsPrice}</td>
                    <td className="py-2 pr-4">{p.stockAvailable}</td>
                    <td className="py-2 pr-4">{p.stockReserved}</td>
                    <td className="py-2 pr-4">{PRODUCT_STATUS_LABELS[p.status] || p.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {productTargets(p.status).map((t) => (
                          <ProductStatusButton
                            key={t}
                            productId={p._id.toString()}
                            target={t}
                            label={PRODUCT_TARGET_LABELS[t]}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a product</h2>
        <ProductForm categories={categories} fulfillments={fulfillments} />
      </section>
    </div>
  );
}
