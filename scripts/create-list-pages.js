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
  "lib/statusTone.js",
  "lib/auth/guards.js",
  "lib/reportStatus.js",
  "lib/complaintStatus.js",
  "lib/contactStatus.js",
  "lib/rewardStatus.js",
  "models/Complaint.js",
  "models/ContactMessage.js",
  "models/RewardOrder.js",
  "models/WasteReport.js",
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

write("app/admin/(panel)/complaints/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { COMPLAINT_STATUSES, COMPLAINT_STATUS_LABELS, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status, q) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/complaints" + (qs ? "?" + qs : "");
}

export default async function AdminComplaintsPage({ searchParams }) {
  await requirePermission("complaints.resolve");
  const sp = await searchParams;
  const status = COMPLAINT_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toUpperCase() : "";
  // Only letters, numbers and hyphens are allowed, so no regex special characters can get in.
  const q = /^[A-Z0-9-]{1,30}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (q) filter.ticketNumber = { $regex: "^" + q };

  let complaints = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("assignedTo", "name")
        .select("ticketNumber category priority status assignedTo createdAt")
        .lean(),
      Complaint.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load admin complaints failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs = [{ label: "All", href: href(1, null, q), active: !status }].concat(
    COMPLAINT_STATUSES.map((s) => ({
      label: COMPLAINT_STATUS_LABELS[s],
      href: href(1, s, q),
      active: status === s,
    }))
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <form action="/admin/complaints" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search ticket number</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={30} placeholder="ECC-2026"
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Search
        </button>
      </form>

      <div className="mt-4">
        <FilterTabs label="Status filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Complaints could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && complaints.length === 0 && (
        <div className="mt-4">
          <EmptyState>No complaints match this filter.</EmptyState>
        </div>
      )}

      {complaints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Ticket</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Priority</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Assigned to</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/complaints/" + c.ticketNumber} className="font-semibold text-emerald-800 underline">
                      {c.ticketNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{COMPLAINT_CATEGORIES[c.category] || c.category}</td>
                  <td className="py-2 pr-4">{c.priority}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={c.status} label={COMPLAINT_STATUS_LABELS[c.status]} />
                  </td>
                  <td className="py-2 pr-4">{c.assignedTo ? c.assignedTo.name : "Unassigned"}</td>
                  <td className="py-2">{formatDateTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} prevHref={href(page - 1, status, q)} nextHref={href(page + 1, status, q)} />
    </section>
  );
}
`);

write("app/admin/(panel)/contact-messages/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import ContactMessage from "@/models/ContactMessage";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { CONTACT_STATUSES, CONTACT_STATUS_LABELS, CONTACT_CATEGORIES } from "@/lib/contactStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

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
  const tabs = [{ label: "All", href: href(1, null, q), active: !status }].concat(
    CONTACT_STATUSES.map((s) => ({
      label: CONTACT_STATUS_LABELS[s],
      href: href(1, s, q),
      active: status === s,
    }))
  );

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

      <div className="mt-4">
        <FilterTabs label="Status filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Messages could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && messages.length === 0 && (
        <div className="mt-4">
          <EmptyState>No messages match this filter.</EmptyState>
        </div>
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
                  <td className="py-2 pr-4">
                    <StatusBadge status={m.status} label={CONTACT_STATUS_LABELS[m.status]} />
                  </td>
                  <td className="py-2">{formatDateTime(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} prevHref={href(page - 1, status, q)} nextHref={href(page + 1, status, q)} />
    </section>
  );
}
`);

write("app/admin/(panel)/orders/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/rewardStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Redemption Orders | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/admin/orders" + (qs ? "?" + qs : "");
}

export default async function AdminOrdersPage({ searchParams }) {
  await requirePermission("rewards.manage");
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  const filter = {};
  if (status) filter.status = status;

  let orders = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [orders, total] = await Promise.all([
      RewardOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name")
        .select("orderNumber productName pointsCost status user createdAt")
        .lean(),
      RewardOrder.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load orders failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tabs = [{ label: "All", href: href(1, null), active: !status }].concat(
    ORDER_STATUSES.map((s) => ({ label: ORDER_STATUS_LABELS[s], href: href(1, s), active: status === s }))
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Redemption Orders</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <div className="mt-4">
        <FilterTabs label="Status filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Orders could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && orders.length === 0 && (
        <div className="mt-4">
          <EmptyState>No orders match this filter.</EmptyState>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Order</th>
                <th scope="col" className="py-2 pr-4">Product</th>
                <th scope="col" className="py-2 pr-4">Resident</th>
                <th scope="col" className="py-2 pr-4">Points</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/orders/" + o.orderNumber} className="font-semibold text-emerald-800 underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.productName}</td>
                  <td className="py-2 pr-4">{o.user ? o.user.name : "-"}</td>
                  <td className="py-2 pr-4">{o.pointsCost}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={o.status} label={ORDER_STATUS_LABELS[o.status]} />
                  </td>
                  <td className="py-2">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pages={pages} prevHref={href(page - 1, status)} nextHref={href(page + 1, status)} />
    </section>
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
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Reports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyReportsPage() {
  const user = await requireRole(["RESIDENT"]);

  let reports = [];
  let loadError = false;
  try {
    await connectDB();
    // Always the signed-in resident's own reports: the id comes from the server session.
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
        <div className="mt-4">
          <ErrorNotice>Reports could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && reports.length === 0 && (
        <div className="mt-4">
          <EmptyState>You have not submitted any reports yet.</EmptyState>
        </div>
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
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status} label={STATUS_LABELS[r.status]} />
                  </td>
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

write("app/dashboard/complaints/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { COMPLAINT_STATUS_LABELS, COMPLAINT_CATEGORIES } from "@/lib/complaintStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Complaints | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyComplaintsPage() {
  const user = await requireRole(["RESIDENT"]);

  let complaints = [];
  let loadError = false;
  try {
    await connectDB();
    // Always the signed-in resident's own complaints: the id comes from the server session.
    complaints = await Complaint.find({ reporter: user.id, deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("ticketNumber category status createdAt")
      .lean();
  } catch (err) {
    console.error("Load complaints failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">My Complaints</h1>
        <Link href="/complaints" className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800">
          New complaint
        </Link>
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Complaints could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && complaints.length === 0 && (
        <div className="mt-4">
          <EmptyState>You have not submitted any complaints yet.</EmptyState>
        </div>
      )}

      {complaints.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Ticket</th>
                <th scope="col" className="py-2 pr-4">Category</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => (
                <tr key={c._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/dashboard/complaints/" + c.ticketNumber} className="font-semibold text-emerald-800 underline">
                      {c.ticketNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{COMPLAINT_CATEGORIES[c.category] || c.category}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={c.status} label={COMPLAINT_STATUS_LABELS[c.status]} />
                  </td>
                  <td className="py-2">{formatDateTime(c.createdAt)}</td>
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