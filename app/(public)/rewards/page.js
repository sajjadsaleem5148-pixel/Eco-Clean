import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { PRODUCT_CATEGORIES, FULFILLMENT_LABELS } from "@/lib/rewardStatus";

export const metadata = { title: "Green Rewards | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  let products = [];
  let loadError = false;
  try {
    await connectDB();
    products = await RewardProduct.find({ status: "PUBLISHED", deletedAt: null })
      .sort({ pointsPrice: 1 })
      .select("name category pointsPrice stockAvailable fulfillment")
      .lean();
  } catch (err) {
    console.error("Load rewards failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Green Rewards</h1>
      <p className="mt-2 text-sm text-gray-700">
        Redeem Green Points for eligible rewards while stock lasts. Points are earned only for verified collections.
        Fresh produce is not offered until supplier, expiry and storage controls are configured.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Rewards are temporarily unavailable. Please try again later.
        </p>
      )}
      {!loadError && products.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No rewards have been published yet.
        </p>
      )}

      {products.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{PRODUCT_CATEGORIES[p.category] || p.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/rewards/" + p._id.toString()} className="text-emerald-900 underline">{p.name}</Link>
              </h2>
              <p className="mt-2 text-2xl font-bold text-emerald-900">{p.pointsPrice} points</p>
              <p className="mt-1 text-sm text-gray-700">{p.stockAvailable > 0 ? "In stock" : "Out of stock"}</p>
              <p className="text-sm text-gray-600">{FULFILLMENT_LABELS[p.fulfillment]}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
