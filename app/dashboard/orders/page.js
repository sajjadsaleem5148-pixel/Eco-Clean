import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUS_LABELS, FULFILLMENT_LABELS } from "@/lib/rewardStatus";
import { CancelOrderForm } from "@/components/forms/RewardForms";

export const metadata = { title: "My Orders | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyOrdersPage({ searchParams }) {
  const user = await requireRole(["RESIDENT"]);
  const sp = await searchParams;

  let orders = [];
  let loadError = false;
  try {
    await connectDB();
    // Hamesha apne orders: user server ke session se aata hai.
    orders = await RewardOrder.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("orderNumber productName pointsCost fulfillment status statusHistory createdAt")
      .lean();
  } catch (err) {
    console.error("Load orders failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        {sp?.placed && (
          <p role="status" className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Your order was placed and the points were deducted. Staff will review it soon.
          </p>
        )}
        {loadError && (
          <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Orders could not be loaded. Please try again later.
          </p>
        )}
        {!loadError && orders.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            You have not redeemed any rewards yet.
          </p>
        )}
      </section>

      {orders.map((o) => (
        <section key={o._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{o.productName}</h2>
          <p className="text-sm text-gray-700">
            Order {o.orderNumber} | {o.pointsCost} points | {FULFILLMENT_LABELS[o.fulfillment]}
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-800">
            Status: {ORDER_STATUS_LABELS[o.status] || o.status}
          </p>
          <ol className="mt-3 space-y-2 text-sm">
            {o.statusHistory.map((h, i) => (
              <li key={i} className="border-l-4 border-emerald-700 pl-3">
                <p className="font-semibold">{ORDER_STATUS_LABELS[h.status] || h.status}</p>
                <p className="text-gray-600">{formatDateTime(h.at)}</p>
                {h.note && <p className="text-gray-700">{h.note}</p>}
              </li>
            ))}
          </ol>
          {o.status === "PENDING" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Cancel this order</summary>
              <CancelOrderForm orderNumber={o.orderNumber} />
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
