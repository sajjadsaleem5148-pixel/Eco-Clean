import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  OPEN_STATUSES,
  REOPEN_WINDOW_DAYS,
  MAX_REOPENS,
} from "@/lib/complaintStatus";
import { ComplaintReplyForm, ComplaintReopenForm } from "@/components/forms/ComplaintForms";

export const metadata = { title: "Complaint Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ComplaintDetailPage({ params }) {
  const user = await requireRole(["RESIDENT"]);
  const { id } = await params;

  let complaint = null;
  let messages = [];
  try {
    await connectDB();
    // reporter ka filter zaroori hai. assignedTo select hi nahi hota.
    complaint = await Complaint.findOne({ ticketNumber: id, reporter: user.id, deletedAt: null })
      .populate("serviceZone", "name")
      .select("ticketNumber category description location serviceZone status statusHistory resolutionSummary resolvedAt reopenCount createdAt")
      .lean();

    if (complaint) {
      // Sirf PUBLIC messages. INTERNAL kabhi query mein nahi aate.
      messages = await ComplaintMessage.find({ complaint: complaint._id, visibility: "PUBLIC" })
        .sort({ createdAt: 1 })
        .select("authorRole body createdAt")
        .lean();
    }
  } catch (err) {
    console.error("Load complaint failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This complaint could not be loaded. Please try again later.
      </p>
    );
  }

  if (!complaint) notFound();

  const isOpen = OPEN_STATUSES.includes(complaint.status);
  const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const canReopen =
    complaint.status === "RESOLVED" &&
    complaint.reopenCount < MAX_REOPENS &&
    complaint.resolvedAt &&
    Date.now() - new Date(complaint.resolvedAt).getTime() <= windowMs;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/dashboard/complaints" className="text-sm font-semibold text-emerald-800 underline">
          Back to my complaints
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Complaint {complaint.ticketNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {COMPLAINT_STATUS_LABELS[complaint.status] || complaint.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{COMPLAINT_CATEGORIES[complaint.category] || complaint.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Zone</dt><dd>{complaint.serviceZone ? complaint.serviceZone.name : "-"}</dd></div>
          {complaint.location && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Location</dt><dd>{complaint.location}</dd></div>
          )}
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Description</dt><dd>{complaint.description}</dd></div>
        </dl>
        {complaint.resolutionSummary && (
          <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Resolution</p>
            <p>{complaint.resolutionSummary}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {messages.map((m) => (
              <li key={m._id.toString()} className="rounded-md border border-gray-200 p-3">
                <p className="font-semibold">{m.authorRole === "RESIDENT" ? "You" : "ECO-CLEAN staff"}</p>
                <p className="text-gray-600">{formatDateTime(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        {isOpen && (
          <div className="mt-4">
            <ComplaintReplyForm ticketNumber={complaint.ticketNumber} />
          </div>
        )}
      </section>

      {canReopen && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Not solved?</h2>
          <p className="mt-1 text-sm text-gray-700">
            You can reopen a resolved complaint once, within {REOPEN_WINDOW_DAYS} days.
          </p>
          <div className="mt-3">
            <ComplaintReopenForm ticketNumber={complaint.ticketNumber} />
          </div>
        </section>
      )}

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
