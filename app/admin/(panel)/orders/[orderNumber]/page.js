import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUS_LABELS, FULFILLMENT_LABELS, nextOrderStatuses } from "@/lib/rewardStatus";
import { OrderStatusForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Order Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }) {
  const user = await requirePermission("rewards.manage");
  const { orderNumber } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let order = null;
  try {
    await connectDB();
    order = await RewardOrder.findOne({ orderNumber }).populate("user", "name email").lean();
  } catch (err) {
    console.error("Load order failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This order could not be loaded. Please try again later.
      </p>
    );
  }

  if (!order) notFound();

  const statuses = nextOrderStatuses(order.status, order.fulfillment).map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s],
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/orders" className="text-sm font-semibold text-emerald-800 underline">Back to orders</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Order {order.orderNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {ORDER_STATUS_LABELS[order.status] || order.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Product</dt><dd>{order.productName}</dd></div>
          <div><dt className="font-medium text-gray-600">Points paid</dt><dd>{order.pointsCost}</dd></div>
          <div><dt className="font-medium text-gray-600">Fulfillment</dt><dd>{FULFILLMENT_LABELS[order.fulfillment]}</dd></div>
          {canSeeUser && order.user && (
            <div><dt className="font-medium text-gray-600">Resident</dt><dd>{order.user.name} ({order.user.email})</dd></div>
          )}
          {order.note && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Resident note</dt><dd>{order.note}</dd></div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Update status</h2>
        {statuses.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No further status changes are available for this order.</p>
        ) : (
          <div className="mt-3">
            <OrderStatusForm orderNumber={order.orderNumber} statuses={statuses} />
            <p className="mt-3 text-xs text-gray-600">
              Rejecting or cancelling releases the reserved stock and refunds the resident's points automatically.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {order.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{ORDER_STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
