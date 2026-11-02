import crypto from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import { getCurrentUser } from "@/lib/auth/session";
import { PRODUCT_CATEGORIES, FULFILLMENT_LABELS } from "@/lib/rewardStatus";
import { RedeemForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Reward Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function RewardDetailPage({ params }) {
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) notFound();

  let product = null;
  let user = null;
  let balance = 0;
  let loadError = false;
  try {
    await connectDB();
    product = await RewardProduct.findOne({ _id: id, status: "PUBLISHED", deletedAt: null })
      .select("name description category pointsPrice stockAvailable fulfillment environmentalBenefit")
      .lean();
    user = await getCurrentUser();
    if (product && user && user.role === "RESIDENT") {
      const account = await GreenPointsAccount.findOne({ user: user.id }).lean();
      balance = account ? account.balance : 0;
    }
  } catch (err) {
    console.error("Load reward failed:", err.message);
    loadError = true;
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This reward could not be loaded. Please try again later.
        </p>
      </main>
    );
  }
  if (!product) notFound();

  const inStock = product.stockAvailable > 0;
  const isResident = user && user.role === "RESIDENT";
  const enough = balance >= product.pointsPrice;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/rewards" className="text-sm font-semibold text-emerald-800 underline">Back to rewards</Link>
      <h1 className="mt-2 text-3xl font-bold text-emerald-900">{product.name}</h1>
      <p className="mt-1 text-sm font-semibold text-emerald-800">{PRODUCT_CATEGORIES[product.category] || product.category}</p>
      <p className="mt-4 text-sm text-gray-800">{product.description}</p>
      {product.environmentalBenefit && (
        <p className="mt-3 text-sm text-gray-700">Environmental benefit: {product.environmentalBenefit}</p>
      )}
      <p className="mt-4 text-2xl font-bold text-emerald-900">{product.pointsPrice} points</p>
      <p className="text-sm text-gray-700">{inStock ? "In stock" : "Out of stock"} | {FULFILLMENT_LABELS[product.fulfillment]}</p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        {!user && (
          <p className="text-sm">
            Please <Link href="/login" className="font-semibold text-emerald-800 underline">log in</Link> or{" "}
            <Link href="/register" className="font-semibold text-emerald-800 underline">register</Link> to redeem this reward.
          </p>
        )}
        {user && !isResident && (
          <p className="text-sm text-gray-700">Only resident accounts can redeem rewards.</p>
        )}
        {isResident && (
          <>
            <p className="mb-3 text-sm text-gray-700">Your balance: <span className="font-semibold">{balance}</span> points</p>
            {!inStock && <p className="text-sm text-amber-900">This reward is currently out of stock.</p>}
            {inStock && !enough && (
              <p className="text-sm text-amber-900">
                You need {product.pointsPrice - balance} more points to redeem this reward.
              </p>
            )}
            {inStock && enough && (
              <RedeemForm
                productId={product._id.toString()}
                price={product.pointsPrice}
                idempotencyKey={crypto.randomUUID()}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
