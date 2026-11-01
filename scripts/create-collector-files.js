const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

// ---- WasteReport model mein assignment fields jodna ----
const modelPath = "models/WasteReport.js";
if (!fs.existsSync(modelPath)) {
  throw new Error("models/WasteReport.js nahi mili. Pehle create-reports-files.js chalayen.");
}
let m = fs.readFileSync(modelPath, "utf8");
if (!m.includes("assignedCollector")) {
  const marker = "idempotencyKey: { type: String },";
  if (!m.includes(marker)) throw new Error("WasteReport.js mein jodne ki jagah nahi mili");
  m = m.replace(
    marker,
    marker +
      '\n    assignedCollector: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },' +
      "\n    assignedAt: { type: Date },"
  );
  fs.writeFileSync(modelPath, m, "utf8");
  console.log("Patched:", modelPath);
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

// Assignment: Verified se pehli dafa, Assigned se reassign (collector ke accept karne se pehle).
export const ASSIGNABLE_FROM = ["VERIFIED", "ASSIGNED"];

// Collector ke steps: naya status -> kin statuses se allowed.
export const COLLECTOR_FROM = {
  ACCEPTED: ["ASSIGNED"],
  ON_THE_WAY: ["ACCEPTED"],
  ARRIVED: ["ON_THE_WAY"],
  COLLECTED: ["ARRIVED"],
  UNABLE_TO_COLLECT: ["ACCEPTED", "ON_THE_WAY", "ARRIVED"],
};

export const COLLECTOR_STEPS = Object.keys(COLLECTOR_FROM);

export const COLLECTOR_LABELS = {
  ACCEPTED: "Accept job",
  ON_THE_WAY: "Mark On the Way",
  ARRIVED: "Mark Arrived",
  COLLECTED: "Mark Collected",
  UNABLE_TO_COLLECT: "Report Unable to Collect",
};

export const NOTE_REQUIRED = ["COLLECTED", "UNABLE_TO_COLLECT"];

export function collectorStepsFor(status) {
  return COLLECTOR_STEPS.filter((s) => COLLECTOR_FROM[s].includes(status));
}
`);

write("actions/collectors.js", `
"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { ROLES } from "@/lib/permissions/roles";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
  serviceZone: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a zone"),
});

export async function createCollectorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    serviceZone: formData.get("serviceZone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const zone = await ServiceZone.findOne({ _id: d.serviceZone, status: "ACTIVE", deletedAt: null }).select("_id").lean();
    if (!zone) return { error: "The selected zone is not available." };

    const passwordHash = await bcrypt.hash(d.password, 12);
    const created = await User.create({
      name: d.name,
      email: d.email,
      passwordHash,
      role: ROLES.COLLECTOR,
      serviceZone: zone._id,
    });

    await writeAudit({
      actor: user.id,
      action: "collector.create",
      targetType: "User",
      targetId: created._id.toString(),
      metadata: { zone: d.serviceZone },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return { error: "An account with this email may already exist." };
    }
    console.error("Create collector failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/collectors");
  return { success: "Collector account created. Share the temporary password with them securely." };
}
`);

write("actions/assignments.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { ROLES } from "@/lib/permissions/roles";
import { ASSIGNABLE_FROM } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  collectorId: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a collector"),
  reason: z.string().trim().max(500, "Reason is too long").optional(),
});

export async function assignCollectorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("reports.assign");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    collectorId: formData.get("collectorId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, collectorId, reason } = parsed.data;

  try {
    await connectDB();

    const report = await WasteReport.findOne({ reportId, deletedAt: null })
      .select("status serviceZone assignedCollector");
    if (!report || !ASSIGNABLE_FROM.includes(report.status)) {
      return { error: "This report cannot be assigned right now." };
    }

    const collector = await User.findOne({
      _id: collectorId,
      role: ROLES.COLLECTOR,
      status: "ACTIVE",
      deletedAt: null,
    }).select("serviceZone");
    if (!collector) return { error: "The selected collector is not available." };

    if (!collector.serviceZone || collector.serviceZone.toString() !== report.serviceZone.toString()) {
      return { error: "This collector is not assigned to the report's service zone." };
    }

    const isReassign = report.status === "ASSIGNED";
    if (isReassign) {
      if (report.assignedCollector && report.assignedCollector.toString() === collectorId) {
        return { error: "This collector is already assigned." };
      }
      if (!reason || reason.length < 10) {
        return { error: "A reason of at least 10 characters is required to reassign." };
      }
    }

    const note = isReassign
      ? "Reassigned to another collector: " + reason
      : "Collector assigned" + (reason ? ": " + reason : "");

    const updated = await WasteReport.findOneAndUpdate(
      { reportId, deletedAt: null, status: report.status },
      {
        $set: { status: "ASSIGNED", assignedCollector: collector._id, assignedAt: new Date() },
        $push: { statusHistory: { status: "ASSIGNED", at: new Date(), by: user.id, note } },
      },
      { new: true }
    ).select("reportId");

    if (!updated) {
      return { error: "This report was updated by someone else. Please reload and try again." };
    }

    await writeAudit({
      actor: user.id,
      action: isReassign ? "report.reassign" : "report.assign",
      targetType: "WasteReport",
      targetId: reportId,
      reason: isReassign ? reason : undefined,
      metadata: { collectorId },
    });
  } catch (err) {
    console.error("Assign collector failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/reports");
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Collector assigned." };
}
`);

write("actions/collectorJobs.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { COLLECTOR_STEPS, COLLECTOR_FROM, NOTE_REQUIRED } from "@/lib/reportTransitions";

const schema = z.object({
  reportId: z.string().regex(/^ECR-\\d{8}-[A-F0-9]{8}$/, "Invalid job"),
  step: z.enum(COLLECTOR_STEPS, { message: "Please choose an action" }),
  note: z.string().trim().max(500, "Note is too long").optional(),
});

export async function updateJobAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COLLECTOR") {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    reportId: formData.get("reportId"),
    step: formData.get("step"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, step, note } = parsed.data;

  if (NOTE_REQUIRED.includes(step) && (!note || note.length < 10)) {
    return { error: "A note of at least 10 characters is required for this action." };
  }

  const defaults = {
    ACCEPTED: "Collector accepted the job",
    ON_THE_WAY: "Collector is on the way",
    ARRIVED: "Collector arrived at the location",
  };

  try {
    await connectDB();
    // Sirf apni job, aur sirf allowed status se. Warna kuch nahi badlega.
    const updated = await WasteReport.findOneAndUpdate(
      {
        reportId,
        deletedAt: null,
        assignedCollector: user.id,
        status: { $in: COLLECTOR_FROM[step] },
      },
      {
        $set: { status: step },
        $push: {
          statusHistory: { status: step, at: new Date(), by: user.id, note: note || defaults[step] },
        },
      },
      { new: true }
    ).select("reportId");

    if (!updated) {
      return { error: "This job cannot be moved to that status. It may have already been updated." };
    }

    await writeAudit({
      actor: user.id,
      action: "job." + step.toLowerCase(),
      targetType: "WasteReport",
      targetId: reportId,
      reason: NOTE_REQUIRED.includes(step) ? note : undefined,
    });
  } catch (err) {
    console.error("Update job failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/collector/jobs");
  revalidatePath("/collector/jobs/" + reportId);
  revalidatePath("/admin/reports/" + reportId);
  return { success: "Job updated." };
}
`);

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

write("components/forms/CollectorForm.js", `
"use client";

import { useActionState } from "react";
import { createCollectorAction } from "@/actions/collectors";

const field = "${field}";

export default function CollectorForm({ zones }) {
  const [state, formAction, pending] = useActionState(createCollectorAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="serviceZone" name="serviceZone" required defaultValue="" className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Temporary password (at least 12 characters)
        </label>
        <input id="password" name="password" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Creating..." : "Create collector"}
      </button>
    </form>
  );
}
`);

write("components/forms/AssignForm.js", `
"use client";

import { useActionState } from "react";
import { assignCollectorAction } from "@/actions/assignments";

const field = "${field}";

export default function AssignForm({ reportId, collectors, isReassign }) {
  const [state, formAction, pending] = useActionState(assignCollectorAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />
      <div>
        <label htmlFor="collectorId" className="mb-1 block text-sm font-medium">Collector (same zone only)</label>
        <select id="collectorId" name="collectorId" required defaultValue="" className={field}>
          <option value="" disabled>Choose a collector</option>
          {collectors.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          {isReassign ? "Reason for reassigning (required)" : "Note (optional)"}
        </label>
        <textarea id="reason" name="reason" rows={2} maxLength={500} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : isReassign ? "Reassign" : "Assign collector"}
      </button>
    </form>
  );
}
`);

write("components/forms/JobActionForm.js", `
"use client";

import { useActionState } from "react";
import { updateJobAction } from "@/actions/collectorJobs";

const field = "${field}";

export default function JobActionForm({ reportId, steps }) {
  const [state, formAction, pending] = useActionState(updateJobAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />
      <div>
        <label htmlFor="step" className="mb-1 block text-sm font-medium">Action</label>
        <select id="step" name="step" required defaultValue="" className={field}>
          <option value="" disabled>Choose an action</option>
          {steps.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-sm font-medium">
          Note (required for Collected and Unable to Collect, at least 10 characters)
        </label>
        <textarea id="note" name="note" rows={3} maxLength={500} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
`);

write("app/admin/(panel)/collectors/page.js", `
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import CollectorForm from "@/components/forms/CollectorForm";

export const metadata = { title: "Collectors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminCollectorsPage() {
  await requirePermission("collections.manage");

  let collectors = [];
  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    const [c, z] = await Promise.all([
      User.find({ role: "COLLECTOR", deletedAt: null }).sort({ createdAt: -1 }).populate("serviceZone", "name").lean(),
      ServiceZone.find({ status: "ACTIVE", deletedAt: null }).sort({ name: 1 }).lean(),
    ]);
    collectors = c;
    zones = z.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load collectors failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Collectors</h1>
        <p className="mt-1 text-sm text-gray-600">Collector accounts can only be created by authorized staff.</p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Collectors could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && collectors.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No collectors yet. Create the first one below.
          </p>
        )}
        {collectors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Email</th>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {collectors.map((c) => (
                  <tr key={c._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4">{c.email}</td>
                    <td className="py-2 pr-4">{c.serviceZone ? c.serviceZone.name : "-"}</td>
                    <td className="py-2">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a collector account</h2>
        {zones.length === 0 ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Create a service zone first.
          </p>
        ) : (
          <CollectorForm zones={zones} />
        )}
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/reports/[reportId]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import User from "@/models/User";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import { decisionsFor, DECISION_LABELS, ASSIGNABLE_FROM } from "@/lib/reportTransitions";
import ReportReviewForm from "@/components/forms/ReportReviewForm";
import AssignForm from "@/components/forms/AssignForm";

export const metadata = { title: "Report Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminReportDetailPage({ params }) {
  const user = await requirePermission("reports.read");
  const { reportId } = await params;
  const canVerify = hasPermission(user.role, "reports.verify");
  const canAssign = hasPermission(user.role, "reports.assign");
  const canSeeUser = hasPermission(user.role, "users.read");

  let report = null;
  let collectors = [];
  try {
    await connectDB();
    report = await WasteReport.findOne({ reportId, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .populate("reporter", "name email")
      .populate("assignedCollector", "name")
      .populate("possibleDuplicateOf", "reportId status")
      .lean();

    if (report && canAssign && ASSIGNABLE_FROM.includes(report.status) && report.serviceZone) {
      const list = await User.find({
        role: "COLLECTOR",
        status: "ACTIVE",
        deletedAt: null,
        serviceZone: report.serviceZone._id,
      }).sort({ name: 1 }).select("name").lean();
      collectors = list.map((c) => ({ id: c._id.toString(), name: c.name }));
    }
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
  const assignable = ASSIGNABLE_FROM.includes(report.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/reports" className="text-sm font-semibold text-emerald-800 underline">Back to reports</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Report {report.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">Status: {STATUS_LABELS[report.status] || report.status}</p>
        {report.assignedCollector && (
          <p className="mt-1 text-sm text-gray-700">Assigned collector: {report.assignedCollector.name}</p>
        )}

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

      {assignable && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{report.status === "ASSIGNED" ? "Reassign collector" : "Assign collector"}</h2>
          {!canAssign && (
            <p className="mt-2 text-sm text-gray-700">Your role cannot assign collectors.</p>
          )}
          {canAssign && collectors.length === 0 && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              No active collectors are available in this zone. Create one in the Collectors section.
            </p>
          )}
          {canAssign && collectors.length > 0 && (
            <div className="mt-3">
              <AssignForm reportId={report.reportId} collectors={collectors} isReassign={report.status === "ASSIGNED"} />
            </div>
          )}
        </section>
      )}

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

write("app/collector/jobs/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";

export const metadata = { title: "My Jobs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorJobsPage() {
  const user = await requireRole(["COLLECTOR"]);

  let jobs = [];
  let loadError = false;
  try {
    await connectDB();
    // Sirf wohi jobs jo is collector ko assign hui hain.
    jobs = await WasteReport.find({ assignedCollector: user.id, deletedAt: null })
      .sort({ assignedAt: -1 })
      .limit(50)
      .populate("category", "name")
      .populate("serviceZone", "name")
      .select("reportId category serviceZone address status assignedAt")
      .lean();
  } catch (err) {
    console.error("Load jobs failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">My Jobs</h1>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Jobs could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && jobs.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No jobs have been assigned to you yet.
        </p>
      )}

      {jobs.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Job</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Address</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/collector/jobs/" + j.reportId} className="font-semibold text-emerald-800 underline">
                      {j.reportId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{j.category ? j.category.name : "-"}</td>
                  <td className="py-2 pr-4">{j.address}</td>
                  <td className="py-2 pr-4">{STATUS_LABELS[j.status] || j.status}</td>
                  <td className="py-2">{j.assignedAt ? formatDateTime(j.assignedAt) : "-"}</td>
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

write("app/collector/jobs/[id]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import { collectorStepsFor, COLLECTOR_LABELS } from "@/lib/reportTransitions";
import JobActionForm from "@/components/forms/JobActionForm";

export const metadata = { title: "Job Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorJobDetailPage({ params }) {
  const user = await requireRole(["COLLECTOR"]);
  const { id } = await params;

  let job = null;
  try {
    await connectDB();
    // assignedCollector ka filter zaroori hai: doosre ki job ka ID jaanne se bhi kuch nahi milta.
    // Reporter ki maloomat kabhi select nahi hoti.
    job = await WasteReport.findOne({ reportId: id, assignedCollector: user.id, deletedAt: null })
      .populate("category", "name")
      .populate("serviceZone", "name")
      .select("reportId category serviceZone address description status statusHistory")
      .lean();
  } catch (err) {
    console.error("Load job failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This job could not be loaded. Please try again later.
      </p>
    );
  }

  if (!job) notFound();

  const steps = collectorStepsFor(job.status).map((s) => ({ value: s, label: COLLECTOR_LABELS[s] }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/collector/jobs" className="text-sm font-semibold text-emerald-800 underline">Back to my jobs</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Job {job.reportId}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">Status: {STATUS_LABELS[job.status] || job.status}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{job.category ? job.category.name : "-"}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{job.serviceZone ? job.serviceZone.name : "-"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Pickup address</dt><dd>{job.address}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{job.description}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Update job</h2>
        {steps.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No further actions are available for this job.</p>
        ) : (
          <div className="mt-3">
            <JobActionForm reportId={job.reportId} steps={steps} />
            <p className="mt-3 text-xs text-gray-600">
              Photo evidence upload is not available yet. Your note is saved in the job history.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Job history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {job.statusHistory.map((h, i) => (
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

console.log("\nSab collector files ban gayin.");