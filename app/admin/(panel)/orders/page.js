import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/rewardStatus";

export const metadata = { title: "Redemption Orders | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/admin/orders" + (qs ? "?" + qs : "");
}

export default async function AdminOrdersPage({ searchParams }) {
  await requirePermission("rewards.manage");
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  const filter = {};
  if (status) filter.status = status;

  let orders = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [orders, total] = await Promise.all([
      RewardOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name")
        .select("orderNumber productName pointsCost status user createdAt")
        .lean(),
      RewardOrder.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load orders failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Redemption Orders</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <nav aria-label="Status filter" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={href(1, s)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Orders could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && orders.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No orders match this filter.
        </p>
      )}

      {orders.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Order</th>
                <th scope="col" className="py-2 pr-4">Product</th>
                <th scope="col" className="py-2 pr-4">Resident</th>
                <th scope="col" className="py-2 pr-4">Points</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/orders/" + o.orderNumber} className="font-semibold text-emerald-800 underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.productName}</td>
                  <td className="py-2 pr-4">{o.user ? o.user.name : "-"}</td>
                  <td className="py-2 pr-4">{o.pointsCost}</td>
                  <td className="py-2 pr-4">{ORDER_STATUS_LABELS[o.status] || o.status}</td>
                  <td className="py-2">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, status)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, status)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
