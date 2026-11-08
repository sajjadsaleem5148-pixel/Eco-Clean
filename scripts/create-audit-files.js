const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "models/AuditLog.js",
  "models/User.js",
  "lib/auth/guards.js",
  "lib/reportStatus.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/Pagination.js",
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

write("app/admin/(panel)/audit-logs/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import AuditLog from "@/models/AuditLog";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Audit Logs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Only these target types can be used as a filter. Anything else in the URL is ignored.
const TARGET_TYPES = [
  "WasteReport",
  "Complaint",
  "User",
  "RewardOrder",
  "RewardProduct",
  "GreenPointsTransaction",
  "PointsEarningRule",
  "ServiceZone",
  "Service",
  "FAQ",
  "WebsitePage",
  "Announcement",
  "ContactMessage",
];

function href(page, action, targetType) {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (targetType) params.set("targetType", targetType);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/audit-logs" + (qs ? "?" + qs : "");
}

export default async function AuditLogsPage({ searchParams }) {
  await requirePermission("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const targetType = TARGET_TYPES.includes(sp?.targetType) ? sp.targetType : null;
  const rawAction = typeof sp?.action === "string" ? sp.action.trim().toLowerCase() : "";
  // Letters, numbers, dot, underscore and hyphen only. A range query is used, not a regex.
  const action = /^[a-z0-9._-]{1,40}$/.test(rawAction) ? rawAction : "";

  const filter = {};
  if (targetType) filter.targetType = targetType;
  if (action) filter.action = { $gte: action, $lt: action + String.fromCharCode(65535) };

  let logs = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("actor", "name role")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load audit logs failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
      <p className="mt-1 text-sm text-gray-600">
        Total: {total}. This list is read-only. Entries cannot be edited or deleted from the application.
      </p>

      <form action="/admin/audit-logs" method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="action" className="mb-1 block text-sm font-medium">Action starts with</label>
          <input id="action" name="action" type="text" defaultValue={action} maxLength={40}
            placeholder="report."
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="targetType" className="mb-1 block text-sm font-medium">Target type</label>
          <select id="targetType" name="targetType" defaultValue={targetType || ""}
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any</option>
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Filter
        </button>
        {(action || targetType) && (
          <Link href="/admin/audit-logs" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">
            Clear filters
          </Link>
        )}
      </form>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Audit logs could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {!loadError && logs.length === 0 && (
        <div className="mt-4">
          <EmptyState>No audit entries match this filter.</EmptyState>
        </div>
      )}

      {logs.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">When</th>
                <th scope="col" className="py-2 pr-4">Actor</th>
                <th scope="col" className="py-2 pr-4">Action</th>
                <th scope="col" className="py-2 pr-4">Target</th>
                <th scope="col" className="py-2 pr-4">Outcome</th>
                <th scope="col" className="py-2">Reason and details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((a) => {
                const meta = a.metadata ? JSON.stringify(a.metadata).slice(0, 500) : "";
                return (
                  <tr key={a._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4">{formatDateTime(a.createdAt)}</td>
                    <td className="py-2 pr-4">
                      {a.actor ? a.actor.name : "Unknown or deleted"}
                      {a.actor && a.actor.role && (
                        <span className="block text-xs text-gray-600">{a.actor.role}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-medium">{a.action}</td>
                    <td className="py-2 pr-4">
                      {a.targetType || "-"}
                      {a.targetId && <span className="block break-all text-xs text-gray-600">{a.targetId}</span>}
                    </td>
                    <td className="py-2 pr-4">{a.outcome || "SUCCESS"}</td>
                    <td className="py-2">
                      {a.reason && <p className="text-gray-800">{a.reason}</p>}
                      {meta && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Details</summary>
                          <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs text-gray-800">{meta}</pre>
                        </details>
                      )}
                      {!a.reason && !meta && <span className="text-gray-500">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pages={pages}
        prevHref={href(page - 1, action, targetType)}
        nextHref={href(page + 1, action, targetType)}
      />
    </section>
  );
}
`);

// ---- Check 3: read every file back ----
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (!src.includes('requirePermission("audit.read")')) problems.push("missing audit.read permission check");
  if (/updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findOneAndDelete/.test(src)) {
    problems.push("write operations are not allowed on audit logs");
  }
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " file written and checked. Next: npm run build.");