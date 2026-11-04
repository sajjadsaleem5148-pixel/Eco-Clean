import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import {
  CONTACT_CATEGORIES,
  CONTACT_STATUS_LABELS,
  DECISION_LABELS,
  REPLYABLE,
  decisionsFor,
} from "@/lib/contactStatus";
import {
  ContactStatusForm,
  ContactCategoryForm,
  ContactReplyForm,
} from "@/components/forms/AdminContactForms";

export const metadata = { title: "Contact Message | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminContactDetailPage({ params }) {
  const user = await requirePermission("complaints.resolve");
  const { reference } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let msg = null;
  try {
    await connectDB();
    msg = await ContactMessage.findOne({ reference, deletedAt: null })
      .populate("replies.by", "name")
      .lean();
  } catch (err) {
    console.error("Load contact message failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This message could not be loaded. Please try again later.
      </p>
    );
  }

  if (!msg) notFound();

  const decisions = decisionsFor(msg.status).map((d) => ({ value: d, label: DECISION_LABELS[d] }));
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const canReply = REPLYABLE.includes(msg.status);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/contact-messages" className="text-sm font-semibold text-emerald-800 underline">Back to messages</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{msg.subject}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          {msg.reference} | Status: {CONTACT_STATUS_LABELS[msg.status] || msg.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">From</dt><dd>{msg.name}</dd></div>
          {canSeeUser && <div><dt className="font-medium text-gray-600">Email</dt><dd>{msg.email}</dd></div>}
          <div><dt className="font-medium text-gray-600">Category</dt><dd>{CONTACT_CATEGORIES[msg.category] || msg.category}</dd></div>
          <div><dt className="font-medium text-gray-600">Received</dt><dd>{formatDateTime(msg.createdAt)}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Message</dt><dd className="whitespace-pre-wrap">{msg.message}</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Replies</h2>
        <p className="mt-1 text-xs text-gray-600">
          Replies are recorded only. No email provider is configured, so nothing is sent to the sender.
        </p>
        {msg.replies.length === 0 ? (
          <p className="mt-3 text-sm text-gray-700">No replies yet.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {msg.replies.map((r, i) => (
              <li key={i} className="rounded-md border border-gray-200 p-3">
                <p className="font-semibold">{r.by ? r.by.name : "Staff"}</p>
                <p className="text-gray-600">{formatDateTime(r.at)} | Not emailed</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{r.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          {canReply ? (
            <ContactReplyForm reference={msg.reference} />
          ) : (
            <p className="text-sm text-gray-700">This message is closed. Reopen it to record a reply.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status</h2>
        {decisions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No status changes are available.</p>
        ) : (
          <div className="mt-3">
            <ContactStatusForm reference={msg.reference} decisions={decisions} />
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Categorize</h2>
        <div className="mt-3">
          <ContactCategoryForm reference={msg.reference} current={msg.category} categories={categories} />
        </div>
      </section>
    </div>
  );
}
