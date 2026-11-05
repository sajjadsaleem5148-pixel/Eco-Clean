import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { MANAGEABLE_ROLES, USER_STATUSES, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/userAdmin";
import { SuspendForm, ReactivateForm } from "@/components/forms/UserForms";

export const metadata = { title: "Residents and Collectors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, role, status, q) {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/users" + (qs ? "?" + qs : "");
}

export default async function AdminUsersPage({ searchParams }) {
  const admin = await requirePermission("users.read");
  const canSuspend = hasPermission(admin.role, "users.suspend");
  const sp = await searchParams;
  const role = MANAGEABLE_ROLES.includes(sp?.role) ? sp.role : null;
  const status = USER_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toLowerCase() : "";
  const q = /^[a-z0-9@._+-]{1,60}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null, role: role ? role : { $in: MANAGEABLE_ROLES } };
  if (status) filter.status = status;
  // Email shuru se match: regex nahi, sirf range query, is liye injection ka khatra nahi.
  if (q) filter.email = { $gte: q, $lt: q + String.fromCharCode(65535) };

  let users = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select("name email role status suspensionReason createdAt")
        .lean(),
      User.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load users failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Residents and Collectors</h1>
      <p className="mt-1 text-sm text-gray-600">
        Total: {total}. Suspending an account ends its sessions immediately. New collectors are created under Collectors.
      </p>

      <form action="/admin/users" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {role && <input type="hidden" name="role" value={role} />}
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search email (starts with)</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={60}
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Search
        </button>
      </form>

      <nav aria-label="Filters" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null, status, q)} className={"rounded-md border px-3 py-2 " + (!role ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All roles
        </Link>
        {MANAGEABLE_ROLES.map((r) => (
          <Link key={r} href={href(1, r, status, q)} className={"rounded-md border px-3 py-2 " + (role === r ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {ROLE_LABELS[r]}
          </Link>
        ))}
        <span className="px-2 py-2 text-gray-500">|</span>
        <Link href={href(1, role, null, q)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          Any status
        </Link>
        {USER_STATUSES.map((s) => (
          <Link key={s} href={href(1, role, s, q)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {USER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Accounts could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && users.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No accounts match this filter.
        </p>
      )}

      {users.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Name</th>
                <th scope="col" className="py-2 pr-4">Email</th>
                <th scope="col" className="py-2 pr-4">Role</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Joined</th>
                <th scope="col" className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const id = u._id.toString();
                return (
                  <tr key={id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="py-2 pr-4">
                      {USER_STATUS_LABELS[u.status] || u.status}
                      {u.status === "SUSPENDED" && u.suspensionReason && (
                        <span className="block text-xs text-gray-600">Reason: {u.suspensionReason}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{formatDateTime(u.createdAt)}</td>
                    <td className="py-2">
                      {canSuspend && u.status === "ACTIVE" && (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-red-800">Suspend</summary>
                          <SuspendForm userId={id} />
                        </details>
                      )}
                      {canSuspend && u.status === "SUSPENDED" && (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                          <ReactivateForm userId={id} />
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, role, status, q)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, role, status, q)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
