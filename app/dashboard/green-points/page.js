import connectDB from "@/lib/db/connect";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";

export const metadata = { title: "Green Points | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentGreenPointsPage() {
  const user = await requireRole(["RESIDENT"]);

  let account = null;
  let txs = [];
  let loadError = false;
  try {
    await connectDB();
    account = await GreenPointsAccount.findOne({ user: user.id }).lean();
    txs = await GreenPointsTransaction.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("transactionId type points balanceAfter reason createdAt")
      .lean();
  } catch (err) {
    console.error("Load points failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>
        {loadError ? (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Your points could not be loaded. Please try again later.
          </p>
        ) : (
          <>
            <p className="mt-3 text-4xl font-bold text-emerald-900">{account ? account.balance : 0}</p>
            <p className="text-sm text-gray-600">Current balance</p>
            <p className="mt-3 text-sm text-gray-700">
              Points are awarded only after staff verify a collection. Submitting a report or photo alone never earns points.
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">History</h2>
        {!loadError && txs.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            You have no points activity yet.
          </p>
        )}
        {txs.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2 pr-4">Balance</th>
                  <th scope="col" className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{formatDateTime(t.createdAt)}</td>
                    <td className="py-2 pr-4">{TYPE_LABELS[t.type] || t.type}</td>
                    <td className="py-2 pr-4 font-semibold">{formatPoints(t.points)}</td>
                    <td className="py-2 pr-4">{t.balanceAfter}</td>
                    <td className="py-2">{t.reason}</td>
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
