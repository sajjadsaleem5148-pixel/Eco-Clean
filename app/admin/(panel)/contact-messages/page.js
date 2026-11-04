import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, CONTACT_CATEGORIES } from "@/lib/contactStatus";

export const metadata = { title: "Contact Messages | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status, q) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/contact-messages" + (qs ? "?" + qs : "");
}

export default async function AdminContactMessagesPage({ searchParams }) {
  const user = await requirePermission("complaints.resolve");
  const canSeeUser = hasPermission(user.role, "users.read");
  const sp = await searchParams;
  const status = CONTACT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toUpperCase() : "";
  const q = /^[A-Z0-9-]{1,30}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (q) filter.reference = { $regex: "^" + q };

  let messages = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [messages, total] = await Promise.all([
      ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select("reference name email subject category status createdAt")
        .lean(),
      ContactMessage.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load contact messages failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Contact Messages</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <form action="/admin/contact-messages" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search reference</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={30} placeholder="CM-2026"
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Search
        </button>
      </form>

      <nav aria-label="Status filter" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null, q)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All
        </Link>
        {CONTACT_STATUSES.map((s) => (
          <Link key={s} href={href(1, s, q)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {CONTACT_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Messages could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && messages.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No messages match this filter.
        </p>
      )}

      {messages.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Reference</th>
                <th scope="col" className="py-2 pr-4">From</th>
                <th scope="col" className="py-2 pr-4">Subject</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Received</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/contact-messages/" + m.reference} className="font-semibold text-emerald-800 underline">
                      {m.reference}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{m.name}{canSeeUser ? " (" + m.email + ")" : ""}</td>
                  <td className="py-2 pr-4">{m.subject}</td>
                  <td className="py-2 pr-4">{CONTACT_CATEGORIES[m.category] || m.category}</td>
                  <td className="py-2 pr-4">{CONTACT_STATUS_LABELS[m.status] || m.status}</td>
                  <td className="py-2">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, status, q)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, status, q)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
