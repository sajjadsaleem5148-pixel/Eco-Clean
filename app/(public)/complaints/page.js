import crypto from "node:crypto";
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import { COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";
import { ComplaintForm } from "@/components/forms/ComplaintForms";

export const metadata = { title: "Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ComplaintsPage() {
  let user = null;
  let zones = [];
  let loadError = false;

  try {
    user = await getCurrentUser();
    if (user && user.role === "RESIDENT") {
      await connectDB();
      const z = await ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean();
      zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
    }
  } catch (err) {
    console.error("Complaints page load failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(COMPLAINT_CATEGORIES).map(([value, label]) => ({ value, label }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Complaints</h1>
      <p className="mt-2 text-sm text-gray-700">
        Tell us about missed collections, damaged containers, incorrect points or other problems.
        You will get a ticket number and can follow the status in your account.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This page is temporarily unavailable. Please try again later.
        </p>
      )}

      {!loadError && !user && (
        <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Please <Link href="/login" className="font-semibold text-emerald-800 underline">log in</Link> or{" "}
          <Link href="/register" className="font-semibold text-emerald-800 underline">register</Link> to submit a complaint.
        </div>
      )}

      {!loadError && user && user.role !== "RESIDENT" && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          Only resident accounts can submit complaints.
        </p>
      )}

      {!loadError && user && user.role === "RESIDENT" && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <ComplaintForm categories={categories} zones={zones} idempotencyKey={crypto.randomUUID()} />
          <p className="mt-4 text-sm">
            <Link href="/dashboard/complaints" className="font-semibold text-emerald-800 underline">
              View my complaints
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
