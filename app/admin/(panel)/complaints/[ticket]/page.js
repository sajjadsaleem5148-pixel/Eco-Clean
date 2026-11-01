import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import User from "@/models/User";
import "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  DECISION_LABELS,
  ASSIGNABLE_FROM,
  COMPLAINT_STAFF_ROLES,
  decisionsFor,
} from "@/lib/complaintStatus";
import {
  ComplaintStatusForm,
  ComplaintAssignForm,
  StaffMessageForm,
} from "@/components/forms/AdminComplaintForms";

export const metadata = { title: "Complaint Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminComplaintDetailPage({ params }) {
  const user = await requirePermission("complaints.resolve");
  const { ticket } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let complaint = null;
  let messages = [];
  let staff = [];
  try {
    await connectDB();
    complaint = await Complaint.findOne({ ticketNumber: ticket, deletedAt: null })
      .populate("serviceZone", "name")
      .populate("reporter", "name email")
      .populate("assignedTo", "name")
      .lean();

    if (complaint) {
      messages = await ComplaintMessage.find({ complaint: complaint._id })
        .sort({ createdAt: 1 })
        .populate("author", "name")
        .lean();

      if (ASSIGNABLE_FROM.includes(complaint.status)) {
        const list = await User.find({
          role: { $in: COMPLAINT_STAFF_ROLES },
          status: "ACTIVE",
          deletedAt: null,
        }).sort({ name: 1 }).select("name role").lean();
        staff = list.map((s) => ({ id: s._id.toString(), name: s.name, role: s.role }));
      }
    }
  } catch (err) {
    console.error("Load admin complaint failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This complaint could not be loaded. Please try again later.
      </p>
    );
  }

  if (!complaint) notFound();

  const decisions = decisionsFor(complaint.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  const assignable = ASSIGNABLE_FROM.includes(complaint.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/complaints" className="text-sm font-semibold text-emerald-800 underline">Back to complaints</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Complaint {complaint.ticketNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {COMPLAINT_STATUS_LABELS[complaint.status] || complaint.status} | Priority: {complaint.priority}
        </p>
        <p className="mt-1 text-sm text-gray-700">
          Assigned to: {complaint.assignedTo ? complaint.assignedTo.name : "Unassigned"}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{COMPLAINT_CATEGORIES[complaint.category] || complaint.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{complaint.serviceZone ? complaint.serviceZone.name : "-"}</dd></div>
          {canSeeUser && complaint.reporter && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-gray-600">Reporter</dt>
              <dd>{complaint.reporter.name} ({complaint.reporter.email})</dd>
            </div>
          )}
          {complaint.location && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Location</dt><dd>{complaint.location}</dd></div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{complaint.description}</dd></div>
          {complaint.resolutionSummary && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Resolution summary</dt><dd>{complaint.resolutionSummary}</dd></div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Decision</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No status changes are available for this complaint.</p>
        ) : (
          <div className="mt-3">
            <ComplaintStatusForm ticketNumber={complaint.ticketNumber} decisions={decisions} />
          </div>
        )}
      </section>

      {assignable && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{complaint.assignedTo ? "Reassign" : "Assign"}</h2>
          {staff.length === 0 ? (
            <p className="mt-2 text-sm text-gray-700">No staff members are available to assign.</p>
          ) : (
            <div className="mt-3">
              <ComplaintAssignForm
                ticketNumber={complaint.ticketNumber}
                staff={staff}
                isReassign={Boolean(complaint.assignedTo)}
              />
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {messages.map((m) => (
              <li
                key={m._id.toString()}
                className={"rounded-md border p-3 " + (m.visibility === "INTERNAL" ? "border-amber-300 bg-amber-50" : "border-gray-200")}
              >
                <p className="font-semibold">
                  {m.author ? m.author.name : "Unknown"} ({m.authorRole}){" "}
                  <span className="text-xs font-medium">
                    [{m.visibility === "INTERNAL" ? "Internal note" : "Public"}]
                  </span>
                </p>
                <p className="text-gray-600">{formatDateTime(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <StaffMessageForm ticketNumber={complaint.ticketNumber} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {complaint.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{COMPLAINT_STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
