const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/reportTransitions.js", `
export const REVIEW_FROM = {
  UNDER_REVIEW: ["SUBMITTED"],
  VERIFIED: ["SUBMITTED", "UNDER_REVIEW"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW"],
};

export const REVIEW_DECISIONS = Object.keys(REVIEW_FROM);

export const DECISION_LABELS = {
  UNDER_REVIEW: "Mark as Under Review",
  VERIFIED: "Verify report",
  REJECTED: "Reject report",
};

export function decisionsFor(status) {
  return REVIEW_DECISIONS.filter((d) => REVIEW_FROM[d].includes(status));
}
`);

write("actions/adminReports.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { REVIEW_DECISIONS, REVIEW_FROM } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  decision: z.enum(REVIEW_DECISIONS, { message: "Please choose a decision" }),
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

export async function reviewReportAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("reports.verify");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, decision, reason } = parsed.data;

  if (decision === "REJECTED" && (!reason || reason.length < 10)) {
    return { error: "A rejection reason of at least 10 characters is required." };
  }

  const defaultNotes = {
    UNDER_REVIEW: "Report is being reviewed by staff",
    VERIFIED: "Report verified by staff",
  };
  const note = reason || defaultNotes[decision];

  try {
    await connectDB();
    const updated = await WasteReport.findOneAndUpdate(
      { reportId, deletedAt: null, status: { $in: REVIEW_FROM[decision] } },
      {
        $set: { status: decision },
        $push: { statusHistory: { status: decision, at: new Date(), by: user.id, note } },
      },
      { new: true }
    ).select("reportId status");

    if (!updated) {
      return { error: "This report cannot be moved to that status. It may have already been updated." };
    }

    await writeAudit({
      actor: user.id,
      action: "report.review." + decision.toLowerCase(),
      targetType: "WasteReport",
      targetId: updated.reportId,
      reason: decision === "REJECTED" ? reason : undefined,
      metadata: { decision },
    });
  } catch (err) {
    console.error("Review report failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Report updated." };
}
`);

write("components/forms/ReportReviewForm.js", `
"use client";

import { useActionState } from "react";
import { reviewReportAction } from "@/actions/adminReports";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ReportReviewForm({ reportId, decisions }) {
  const [state, formAction, pending] = useActionState(reviewReportAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />

      <div>
        <label htmlFor="decision" className="mb-1 block text-sm font-medium">Decision</label>
        <select id="decision" name="decision" required defaultValue="" className={field}>
          <option value="" disabled>Choose a decision</option>
          {decisions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Reason (required when rejecting; the resident can see it)
        </label>
        <textarea id="reason" name="reason" rows={3} maxLength={500} className={field} />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}

      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save decision"}
      </button>
    </form>
  );
}
`);

write("app/admin/(panel)/reports/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { REPORT_STATUSES, STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "Garbage Reports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/admin/reports" + (qs ? "?" + qs : "");
}

export default async function AdminReportsPage({ searchParams }) {
  await requirePermission("reports.read");
  const sp = await searchParams;
  const status = REPORT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let reports = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [reports, total] = await Promise.all([
      WasteReport.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("category", "name")
        .populate("serviceZone", "name")
        .lean(),
      WasteReport.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load admin reports failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Garbage Reports</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <nav aria-label="Status filter" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All
        </Link>
        {REPORT_STATUSES.map((s) => (
          <Link key={s} href={href(1, s)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Reports could not be loaded. The database may be unavailable.
        </p>
      )}

      {!loadError && reports.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No reports match this filter.
        </p>
      )}

      {reports.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report ID</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Flags</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/reports/" + r.reportId} className="font-semibold text-emerald-800 underline">
                      {r.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.category ? r.category.name : "-"}</td>
                  <td className="py-2 pr-4">{r.serviceZone ? r.serviceZone.name : "-"}</td>
                  <td className="py-2 pr-4">{STATUS_LABELS[r.status] || r.status}</td>
                  <td className="py-2 pr-4">{r.possibleDuplicateOf ? "Possible duplicate" : ""}</td>
                  <td className="py-2">{formatDateTime(r.createdAt)}</td>
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
`);

write("app/admin/(panel)/reports/[reportId]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import { decisionsFor, DECISION_LABELS } from "@/lib/reportTransitions";
import ReportReviewForm from "@/components/forms/ReportReviewForm";

export const metadata = { title: "Report Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminReportDetailPage({ params }) {
  const user = await requirePermission("reports.read");
  const { reportId } = await params;
  const canVerify = hasPermission(user.role, "reports.verify");
  const canSeeUser = hasPermission(user.role, "users.read");

  let report = null;
  try {
    await connectDB();
    report = await WasteReport.findOne({ reportId, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .populate("reporter", "name email")
      .populate("possibleDuplicateOf", "reportId status")
      .lean();
  } catch (err) {
    console.error("Load admin report failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This report could not be loaded. Please try again later.
      </p>
    );
  }

  if (!report) notFound();

  const decisions = decisionsFor(report.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/reports" className="text-sm font-semibold text-emerald-800 underline">Back to reports</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Report {report.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">Status: {STATUS_LABELS[report.status] || report.status}</p>

        {report.possibleDuplicateOf && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Possible duplicate of{" "}
            <Link href={"/admin/reports/" + report.possibleDuplicateOf.reportId} className="font-semibold underline">
              {report.possibleDuplicateOf.reportId}
            </Link>
            . Staff must confirm before rejecting.
          </p>
        )}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{report.category ? report.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{report.serviceZone ? report.serviceZone.name : "-"}</dd></div>
          {canSeeUser && report.reporter && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-gray-600">Reporter</dt>
              <dd>{report.reporter.name} ({report.reporter.email})</dd>
            </div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{report.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{report.description}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Review</h2>
        {!canVerify && (
          <p className="mt-2 text-sm text-gray-700">Your role can view reports but cannot verify or reject them.</p>
        )}
        {canVerify && decisions.length === 0 && (
          <p className="mt-2 text-sm text-gray-700">No review actions are available for this status.</p>
        )}
        {canVerify && decisions.length > 0 && (
          <div className="mt-3">
            <ReportReviewForm reportId={report.reportId} decisions={decisions} />
          </div>
        )}
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

console.log("\nSab admin report files ban gayin.");