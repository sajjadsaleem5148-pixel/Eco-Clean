const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/reportStatus.js", `
export const REPORT_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "ACCEPTED",
  "ON_THE_WAY", "ARRIVED", "COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED",
];

export const CLOSED_STATUSES = ["COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED"];

export const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  VERIFIED: "Verified",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ON_THE_WAY: "On the Way",
  ARRIVED: "Arrived",
  COLLECTED: "Collected",
  UNABLE_TO_COLLECT: "Unable to Collect",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export function formatDateTime(value) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
`);

write("models/WasteReport.js", `
import mongoose from "mongoose";
import { REPORT_STATUSES } from "@/lib/reportStatus";

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: REPORT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const wasteReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "WasteCategory", required: true },
    serviceZone: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceZone", required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    addressKey: { type: String, index: true },
    status: { type: String, enum: REPORT_STATUSES, default: "SUBMITTED", index: true },
    priority: { type: String, enum: ["LOW", "NORMAL", "HIGH"], default: "NORMAL" },
    possibleDuplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "WasteReport" },
    idempotencyKey: { type: String },
    statusHistory: [statusHistorySchema],
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

wasteReportSchema.index(
  { reporter: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
wasteReportSchema.index({ createdAt: -1 });

export default mongoose.models.WasteReport || mongoose.model("WasteReport", wasteReportSchema);
`);

write("actions/reports.js", `
"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import WasteCategory from "@/models/WasteCategory";
import ServiceZone from "@/models/ServiceZone";
import { getCurrentUser } from "@/lib/auth/session";
import { CLOSED_STATUSES } from "@/lib/reportStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a valid option");

const reportSchema = z.object({
  category: objectId,
  serviceZone: objectId,
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  address: z.string().trim().min(5, "Please enter the pickup address").max(300),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid form. Please reload the page."),
});

const MAX_REPORTS_PER_HOUR = 5;
const DUPLICATE_WINDOW_HOURS = 48;

function makeReportId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "ECR-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function createReportAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "Please log in with a resident account to submit a report." };
  }

  const parsed = reportSchema.safeParse({
    category: formData.get("category"),
    serviceZone: formData.get("serviceZone"),
    description: formData.get("description"),
    address: formData.get("address"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  let reportId = null;

  try {
    await connectDB();

    const existing = await WasteReport.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
      .select("reportId").lean();
    if (existing) {
      reportId = existing.reportId;
    } else {
      const [category, zone] = await Promise.all([
        WasteCategory.findOne({ _id: d.category, status: "ACTIVE" }).lean(),
        ServiceZone.findOne({ _id: d.serviceZone, status: "ACTIVE", deletedAt: null }).lean(),
      ]);
      if (!category || !zone) {
        return { error: "The selected category or zone is not available." };
      }

      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await WasteReport.countDocuments({ reporter: user.id, createdAt: { $gte: hourAgo } });
      if (recent >= MAX_REPORTS_PER_HOUR) {
        return { error: "You have submitted too many reports in the last hour. Please try again later." };
      }

      const addressKey = d.address.toLowerCase().replace(/\\s+/g, " ").trim();
      const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
      const duplicate = await WasteReport.findOne({
        serviceZone: zone._id,
        category: category._id,
        addressKey,
        status: { $nin: CLOSED_STATUSES },
        createdAt: { $gte: since },
      }).select("_id").lean();

      try {
        const created = await WasteReport.create({
          reportId: makeReportId(),
          reporter: user.id,
          category: category._id,
          serviceZone: zone._id,
          description: d.description,
          address: d.address,
          addressKey,
          idempotencyKey: d.idempotencyKey,
          possibleDuplicateOf: duplicate ? duplicate._id : undefined,
          statusHistory: [{ status: "SUBMITTED", by: user.id, note: "Report submitted by resident" }],
        });
        reportId = created.reportId;
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey) {
          const again = await WasteReport.findOne({ reporter: user.id, idempotencyKey: d.idempotencyKey })
            .select("reportId").lean();
          if (again) reportId = again.reportId;
        } else {
          throw err;
        }
      }
    }
  } catch (err) {
    console.error("Create report failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  if (!reportId) return { error: "Something went wrong. Please try again." };
  redirect("/dashboard/reports/" + reportId);
}
`);

write("components/forms/ReportForm.js", `
"use client";

import { useActionState } from "react";
import { createReportAction } from "@/actions/reports";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ReportForm({ categories, zones, idempotencyKey }) {
  const [state, formAction, pending] = useActionState(createReportAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Waste category</label>
        <select id="category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="serviceZone" name="serviceZone" required defaultValue="" className={field}>
          <option value="" disabled>Select your zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="address" className="mb-1 block text-sm font-medium">Pickup address or landmark</label>
        <input id="address" name="address" type="text" required minLength={5} maxLength={300} className={field} />
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="description" name="description" rows={4} required minLength={10} maxLength={1000} className={field} />
      </div>

      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Photo upload is not available yet because private image storage is not configured.
        You can still submit this report without a photo.
      </p>

      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Submitting..." : "Submit report"}
      </button>
    </form>
  );
}
`);

write("app/(public)/report-garbage/page.js", `
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
`);

write("app/dashboard/reports/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "My Reports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyReportsPage() {
  const user = await requireRole(["RESIDENT"]);

  let reports = [];
  let loadError = false;
  try {
    await connectDB();
    reports = await WasteReport.find({ reporter: user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("category", "name")
      .populate("serviceZone", "name")
      .lean();
  } catch (err) {
    console.error("Load reports failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
        <Link href="/report-garbage" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          New report
        </Link>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Reports could not be loaded. Please try again later.
        </p>
      )}

      {!loadError && reports.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          You have not submitted any reports yet.
        </p>
      )}

      {reports.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report ID</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/dashboard/reports/" + r.reportId} className="font-semibold text-emerald-800 underline">
                      {r.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.category ? r.category.name : "-"}</td>
                  <td className="py-2 pr-4">{r.serviceZone ? r.serviceZone.name : "-"}</td>
                  <td className="py-2 pr-4">{STATUS_LABELS[r.status] || r.status}</td>
                  <td className="py-2">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
`);

write("app/dashboard/reports/[id]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "Report Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ReportDetailPage({ params }) {
  const user = await requireRole(["RESIDENT"]);
  const { id } = await params;

  let report = null;
  try {
    await connectDB();
    report = await WasteReport.findOne({ reportId: id, reporter: user.id, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .lean();
  } catch (err) {
    console.error("Load report failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This report could not be loaded. Please try again later.
      </p>
    );
  }

  if (!report) notFound();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/dashboard/reports" className="text-sm font-semibold text-emerald-800 underline">
          Back to my reports
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Report {report.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {STATUS_LABELS[report.status] || report.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{report.category ? report.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{report.serviceZone ? report.serviceZone.name : "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{report.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{report.description}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {report.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
`);

console.log("\nSab report files ban gayin.");