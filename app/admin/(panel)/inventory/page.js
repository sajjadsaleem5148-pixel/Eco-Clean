import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import InventoryMovement from "@/models/InventoryMovement";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { MOVEMENT_LABELS } from "@/lib/rewardStatus";
import { StockForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Inventory | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  await requirePermission("inventory.manage");

  let products = [];
  let movements = [];
  let loadError = false;
  try {
    await connectDB();
    [products, movements] = await Promise.all([
      RewardProduct.find({ deletedAt: null }).sort({ name: 1 }).lean(),
      InventoryMovement.find({}).sort({ createdAt: -1 }).limit(20).populate("product", "name").lean(),
    ]);
  } catch (err) {
    console.error("Load inventory failed:", err.message);
    loadError = true;
  }

  const low = products.filter((p) => p.stockAvailable <= p.lowStockThreshold);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Inventory and Stock</h1>
        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Inventory could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && low.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Low stock: {low.map((p) => p.name).join(", ")}
          </p>
        )}
        {!loadError && products.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No products yet. Create products under Reward Products first.
          </p>
        )}

        {products.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Product</th>
                  <th scope="col" className="py-2 pr-4">Available</th>
                  <th scope="col" className="py-2 pr-4">Reserved</th>
                  <th scope="col" className="py-2 pr-4">Threshold</th>
                  <th scope="col" className="py-2">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">
                      {p.name}
                      {p.stockAvailable <= p.lowStockThreshold && (
                        <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Low stock</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{p.stockAvailable}</td>
                    <td className="py-2 pr-4">{p.stockReserved}</td>
                    <td className="py-2 pr-4">{p.lowStockThreshold}</td>
                    <td className="py-2">
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Change stock</summary>
                        <StockForm productId={p._id.toString()} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Recent stock movements</h2>
        {movements.length === 0 ? (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">No movements yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Product</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Quantity</th>
                  <th scope="col" className="py-2 pr-4">Available after</th>
                  <th scope="col" className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{formatDateTime(m.createdAt)}</td>
                    <td className="py-2 pr-4">{m.product ? m.product.name : "-"}</td>
                    <td className="py-2 pr-4">{MOVEMENT_LABELS[m.type] || m.type}</td>
                    <td className="py-2 pr-4 font-semibold">{(m.quantity > 0 ? "+" : "") + m.quantity}</td>
                    <td className="py-2 pr-4">{m.stockAfter}</td>
                    <td className="py-2">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
