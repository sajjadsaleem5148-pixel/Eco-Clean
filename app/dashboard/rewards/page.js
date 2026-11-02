import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import { requireRole } from "@/lib/auth/guards";
import { PRODUCT_CATEGORIES } from "@/lib/rewardStatus";

export const metadata = { title: "Rewards Store | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentRewardsPage() {
  const user = await requireRole(["RESIDENT"]);

  let products = [];
  let balance = 0;
  let loadError = false;
  try {
    await connectDB();
    const [list, account] = await Promise.all([
      RewardProduct.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ pointsPrice: 1 })
        .select("name category pointsPrice stockAvailable")
        .lean(),
      GreenPointsAccount.findOne({ user: user.id }).lean(),
    ]);
    products = list;
    balance = account ? account.balance : 0;
  } catch (err) {
    console.error("Load rewards store failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Rewards Store</h1>
        <p className="text-sm text-gray-700">Balance: <span className="font-semibold">{balance}</span> points</p>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Rewards could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && products.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No rewards have been published yet.
        </p>
      )}

      {products.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <li key={p._id.toString()} className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-semibold text-emerald-800">{PRODUCT_CATEGORIES[p.category] || p.category}</p>
              <p className="mt-1 font-semibold">
                <Link href={"/rewards/" + p._id.toString()} className="text-emerald-900 underline">{p.name}</Link>
              </p>
              <p className="mt-1 text-sm">{p.pointsPrice} points | {p.stockAvailable > 0 ? "In stock" : "Out of stock"}</p>
              <p className="text-sm text-gray-600">
                {balance >= p.pointsPrice ? "You can afford this" : "You need " + (p.pointsPrice - balance) + " more points"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
