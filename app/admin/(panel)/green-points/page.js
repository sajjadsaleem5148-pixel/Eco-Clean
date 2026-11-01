import Link from "next/link";
import connectDB from "@/lib/db/connect";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";
import { AwardForm, AdjustForm, ReverseForm } from "@/components/forms/PointsForms";

export const metadata = { title: "Green Points | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminGreenPointsPage({ searchParams }) {
  const user = await requirePermission("points.read");
  const canAdjust = hasPermission(user.role, "points.adjust");
  const canSeeUser = hasPermission(user.role, "users.read");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  let txs = [];
  let total = 0;
  let pending = [];
  let loadError = false;
  try {
    await connectDB();
    [txs, total] = await Promise.all([
      GreenPointsTransaction.find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name email")
        .lean(),
      GreenPointsTransaction.countDocuments({}),
    ]);

    if (canAdjust) {
      const collected = await WasteReport.find({ status: "COLLECTED", deletedAt: null })
        .sort({ updatedAt: -1 })
        .limit(50)
        .populate("category", "name")
        .select("reportId category updatedAt")
        .lean();
      const keys = collected.map((r) => "report-award:" + r.reportId);
      const done = await GreenPointsTransaction.find({ idempotencyKey: { $in: keys } })
        .select("idempotencyKey")
        .lean();
      const doneSet = new Set(done.map((d) => d.idempotencyKey));
      const rules = await PointsEarningRule.find({ active: true }).lean();
      const ruleMap = new Map(rules.map((r) => [r.category.toString(), r.points]));

      pending = collected
        .filter((r) => !doneSet.has("report-award:" + r.reportId))
        .slice(0, 20)
        .map((r) => ({
          reportId: r.reportId,
          categoryName: r.category ? r.category.name : "-",
          points: r.category ? ruleMap.get(r.category._id.toString()) : undefined,
        }));
    }
  } catch (err) {
    console.error("Load green points failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {loadError && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Green Points data could not be loaded. The database may be unavailable.
        </p>
      )}

      {canAdjust && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>
          <h2 className="mt-4 text-lg font-semibold">Collected reports awaiting points</h2>
          <p className="mt-1 text-sm text-gray-600">
            Segregation inspections are not recorded yet, so you confirm verification manually.
          </p>
          {pending.length === 0 ? (
            <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No collected reports are waiting for points.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {pending.map((p) => (
                <li key={p.reportId} className="rounded-md border border-gray-200 p-4">
                  <p className="text-sm font-semibold">
                    <Link href={"/admin/reports/" + p.reportId} className="text-emerald-800 underline">{p.reportId}</Link>
                    {" "}| {p.categoryName}
                  </p>
                  {p.points ? (
                    <div className="mt-3">
                      <AwardForm reportId={p.reportId} points={p.points} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-amber-900">
                      No active earning rule for this category.{" "}
                      <Link href="/admin/points-rules" className="font-semibold underline">Create a rule</Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canAdjust && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Manual adjustment</h2>
          <AdjustForm />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        {!canAdjust && <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>}
        <h2 className="text-lg font-semibold">Transactions</h2>
        <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

        {!loadError && txs.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No transactions yet.
          </p>
        )}

        {txs.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Transaction</th>
                  <th scope="col" className="py-2 pr-4">Resident</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2 pr-4">Balance after</th>
                  <th scope="col" className="py-2 pr-4">Reason</th>
                  <th scope="col" className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4">{t.transactionId}</td>
                    <td className="py-2 pr-4">
                      {t.user ? t.user.name : "-"}
                      {canSeeUser && t.user ? " (" + t.user.email + ")" : ""}
                    </td>
                    <td className="py-2 pr-4">
                      {TYPE_LABELS[t.type] || t.type}
                      {t.reversedBy ? " (reversed)" : ""}
                    </td>
                    <td className="py-2 pr-4 font-semibold">{formatPoints(t.points)}</td>
                    <td className="py-2 pr-4">{t.balanceAfter}</td>
                    <td className="py-2 pr-4">
                      {t.reason}
                      {canAdjust && ["EARN", "ADJUST"].includes(t.type) && !t.reversedBy && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reverse</summary>
                          <ReverseForm transactionId={t.transactionId} />
                        </details>
                      )}
                    </td>
                    <td className="py-2">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={"/admin/green-points?page=" + (page - 1)} className="font-semibold text-emerald-800 underline">Previous</Link>
            ) : <span />}
            <span>Page {page} of {pages}</span>
            {page < pages ? (
              <Link href={"/admin/green-points?page=" + (page + 1)} className="font-semibold text-emerald-800 underline">Next</Link>
            ) : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
