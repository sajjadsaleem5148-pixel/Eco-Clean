import crypto from "node:crypto";
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import ReportForm from "@/components/forms/ReportForm";

export const metadata = { title: "Report Garbage | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ReportGarbagePage() {
  let user = null;
  let categories = [];
  let zones = [];
  let loadError = false;

  try {
    user = await getCurrentUser();
    if (user && user.role === "RESIDENT") {
      await connectDB();
      const [c, z] = await Promise.all([
        WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1 }).lean(),
        ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
      ]);
      categories = c.map((x) => ({ id: x._id.toString(), name: x.name }));
      zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    }
  } catch (err) {
    console.error("Report page load failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Report Garbage</h1>
      <p className="mt-2 text-sm text-gray-700">
        A report does not dispatch a collector automatically. Authorized staff review it first.
        Green Points are never awarded just for submitting a report.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This page is temporarily unavailable. Please try again later.
        </p>
      )}

      {!loadError && !user && (
        <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Please <Link href="/login" className="font-semibold text-emerald-800 underline">log in</Link> or{" "}
          <Link href="/register" className="font-semibold text-emerald-800 underline">register</Link> to submit a report.
        </div>
      )}

      {!loadError && user && user.role !== "RESIDENT" && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Only resident accounts can submit garbage reports.
        </p>
      )}

      {!loadError && user && user.role === "RESIDENT" && (zones.length === 0 || categories.length === 0) && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Reporting is not available yet because service zones or waste categories have not been configured.
        </p>
      )}

      {!loadError && user && user.role === "RESIDENT" && zones.length > 0 && categories.length > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <ReportForm categories={categories} zones={zones} idempotencyKey={crypto.randomUUID()} />
        </div>
      )}
    </main>
  );
}
