const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "components/tables/Pagination.js",
  "components/forms/UserForms.js",
  "components/forms/ContentForms.js",
  "lib/userAdmin.js",
  "lib/contentStatus.js",
  "lib/auth/guards.js",
  "lib/reportStatus.js",
  "models/User.js",
  "models/Service.js",
  "models/FAQ.js",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("app/admin/(panel)/users/page.js", `
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { MANAGEABLE_ROLES, USER_STATUSES, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/userAdmin";
import { SuspendForm, ReactivateForm } from "@/components/forms/UserForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

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
  // Email prefix match uses a range query, not a regex, so there is no injection risk.
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
  const roleTabs = [{ label: "All roles", href: href(1, null, status, q), active: !role }].concat(
    MANAGEABLE_ROLES.map((r) => ({ label: ROLE_LABELS[r], href: href(1, r, status, q), active: role === r }))
  );
  const statusTabs = [{ label: "Any status", href: href(1, role, null, q), active: !status }].concat(
    USER_STATUSES.map((s) => ({ label: USER_STATUS_LABELS[s], href: href(1, role, s, q), active: status === s }))
  );

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

      <div className="mt-4 space-y-2">
        <FilterTabs label="Role filter" items={roleTabs} />
        <FilterTabs label="Status filter" items={statusTabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Accounts could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && users.length === 0 && (
        <div className="mt-4">
          <EmptyState>No accounts match this filter.</EmptyState>
        </div>
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
                      <StatusBadge status={u.status} label={USER_STATUS_LABELS[u.status]} />
                      {u.status === "SUSPENDED" && u.suspensionReason && (
                        <span className="mt-1 block text-xs text-gray-600">Reason: {u.suspensionReason}</span>
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

      <Pagination page={page} pages={pages} prevHref={href(page - 1, role, status, q)} nextHref={href(page + 1, role, status, q)} />
    </section>
  );
}
`);

write("app/admin/(panel)/services/page.js", `
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  SERVICE_CATEGORIES,
  ELIGIBLE_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TARGET_LABELS,
  contentTargets,
} from "@/lib/contentStatus";
import { ServiceForm, ContentStatusButton } from "@/components/forms/ContentForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Services | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requirePermission("content.publish");

  let services = [];
  let loadError = false;
  try {
    await connectDB();
    services = await Service.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load services failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(SERVICE_CATEGORIES).map(([value, label]) => ({ value, label }));
  const eligibles = Object.entries(ELIGIBLE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="mt-1 text-sm text-gray-600">
          New services start as drafts. Only published services appear on the public Services page.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Services could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && services.length === 0 && (
          <div className="mt-4">
            <EmptyState>No services yet. Create the first one below.</EmptyState>
          </div>
        )}

        {services.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Title</th>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Eligible</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Published by</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{s.title}</td>
                    <td className="py-2 pr-4">{SERVICE_CATEGORIES[s.category] || s.category}</td>
                    <td className="py-2 pr-4">{ELIGIBLE_LABELS[s.eligibleCustomer]}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={s.status} label={CONTENT_STATUS_LABELS[s.status]} />
                    </td>
                    <td className="py-2 pr-4">{s.publishedBy ? s.publishedBy.name : "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {contentTargets(s.status).map((t) => (
                          <ContentStatusButton
                            key={t}
                            kind="service"
                            id={s._id.toString()}
                            target={t}
                            label={CONTENT_TARGET_LABELS[t]}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a service</h2>
        <ServiceForm categories={categories} eligibles={eligibles} />
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/faqs/page.js", `
import connectDB from "@/lib/db/connect";
import FAQ from "@/models/FAQ";
import { requirePermission } from "@/lib/auth/guards";
import { CONTENT_STATUS_LABELS, CONTENT_TARGET_LABELS, contentTargets } from "@/lib/contentStatus";
import { FaqForm, ContentStatusButton } from "@/components/forms/ContentForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "FAQs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminFaqsPage() {
  await requirePermission("content.publish");

  let faqs = [];
  let loadError = false;
  try {
    await connectDB();
    faqs = await FAQ.find({ deletedAt: null }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load FAQs failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">FAQs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Published FAQs appear at the bottom of the public Services page.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>FAQs could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && faqs.length === 0 && (
          <div className="mt-4">
            <EmptyState>No FAQs yet. Create the first one below.</EmptyState>
          </div>
        )}

        {faqs.length > 0 && (
          <ul className="mt-4 space-y-3">
            {faqs.map((f) => (
              <li key={f._id.toString()} className="rounded-md border border-gray-200 p-4">
                <p className="font-semibold">{f.question}</p>
                <p className="mt-1 text-sm text-gray-700">{f.answer}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <StatusBadge status={f.status} label={CONTENT_STATUS_LABELS[f.status]} />
                  <span>Order: {f.sortOrder}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contentTargets(f.status).map((t) => (
                    <ContentStatusButton
                      key={t}
                      kind="faq"
                      id={f._id.toString()}
                      target={t}
                      label={CONTENT_TARGET_LABELS[t]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a FAQ</h2>
        <FaqForm />
      </section>
    </div>
  );
}
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (empty): " + f);
    failed++;
  } else if (src.includes("PlaceholderPage")) {
    console.log(" FAIL (old placeholder): " + f);
    failed++;
  } else if (romanUrdu.test(src)) {
    console.log(" FAIL (Roman Urdu present): " + f);
    failed++;
  } else if (!src.includes("@/components/ui/StatusBadge")) {
    console.log(" FAIL (does not use StatusBadge): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, then npm run build.");