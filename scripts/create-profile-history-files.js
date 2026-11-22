const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/auth/session.js",
  "lib/reportStatus.js",
  "models/User.js",
  "models/WasteReport.js",
  "models/ServiceZone.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "components/tables/Pagination.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}
if (!fs.readFileSync("models/WasteReport.js", "utf8").includes("assignedCollector")) {
  console.error("FAILED: models/WasteReport.js has no assignedCollector field. Run create-collector-files.js first.");
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

write("lib/profileRules.js", `
export const NAME_MIN = 2;
export const NAME_MAX = 120;

export function normalizeDisplayName(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// A name needs at least one letter or number, and no angle brackets or control characters.
export function isValidDisplayName(value) {
  const name = normalizeDisplayName(value);
  if (name.length < NAME_MIN || name.length > NAME_MAX) return false;
  if (/[<>\\u0000-\\u001f\\u007f]/.test(name)) return false;
  return /[\\p{L}\\p{N}]/u.test(name);
}
`);

write("actions/profile.js", `
"use server";

import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { getCurrentUser } from "@/lib/auth/session";
import { NAME_MIN, NAME_MAX, normalizeDisplayName, isValidDisplayName } from "@/lib/profileRules";

export async function updateProfileAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "You do not have permission to do this." };
  }

  // Only the name is read from the form. Any other field that is sent is ignored.
  const name = normalizeDisplayName(String(formData.get("name") || ""));
  if (name.length < NAME_MIN) return { error: "Name must be at least " + NAME_MIN + " characters" };
  if (name.length > NAME_MAX) return { error: "Name is too long (" + NAME_MAX + " characters maximum)" };
  if (!isValidDisplayName(name)) {
    return { error: "Enter a valid name. It needs a letter or number and no < or > characters." };
  }

  try {
    await connectDB();
    // The id comes from the server session, never from the form.
    const res = await User.updateOne(
      { _id: user.id, role: "RESIDENT", status: "ACTIVE", deletedAt: null },
      { $set: { name: name } }
    );
    if (res.matchedCount === 0) return { error: "Your account could not be found." };
  } catch (err) {
    console.error("Update profile failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard");
  return { success: "Your name was saved. It may take until your next login to show in the header." };
}
`);

write("components/forms/ProfileForm.js", `
"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/profile";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ProfileForm({ name }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="pf-name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="pf-name" name="name" type="text" required minLength={2} maxLength={120}
          autoComplete="name" defaultValue={name} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save name"}
      </button>
    </form>
  );
}
`);

write("app/dashboard/profile/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import "@/models/ServiceZone";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import ProfileForm from "@/components/forms/ProfileForm";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "My Profile | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireRole(["RESIDENT"]);

  let profile = null;
  let loadError = false;
  try {
    await connectDB();
    // Always the signed-in resident's own record: the id comes from the server session.
    profile = await User.findById(user.id)
      .select("name email serviceZone createdAt")
      .populate("serviceZone", "name")
      .lean();
  } catch (err) {
    console.error("Load profile failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          You can change your name here. Your email cannot be changed on this page. Phone, address and photo are not
          part of this version.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Your profile could not be loaded. Please try again later.</ErrorNotice>
          </div>
        )}
      </section>

      {profile && (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Your name</h2>
            <ProfileForm name={profile.name} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-semibold">Account details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-gray-600">Email</dt>
                <dd className="break-all">{profile.email}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Service zone</dt>
                <dd>
                  {profile.serviceZone ? profile.serviceZone.name : "Not chosen yet"}{" "}
                  <Link href="/dashboard/household" className="font-semibold text-emerald-800 underline">Change</Link>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Member since</dt>
                <dd>{formatDateTime(profile.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Password</dt>
                <dd>
                  <Link href="/dashboard/settings" className="font-semibold text-emerald-800 underline">Change password</Link>
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
`);

write("services/collectorHistory.js", `
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";

export const HISTORY_STATUSES = ["COLLECTED", "UNABLE_TO_COLLECT"];

// Read-only. Only this collector's own finished jobs. The person who made the report is never selected.
export async function listCollectorHistory(collectorId, options) {
  const opts = options || {};
  const pageSize = opts.pageSize || 20;
  const page = Math.max(1, opts.page || 1);
  const statuses = HISTORY_STATUSES.includes(opts.status) ? [opts.status] : HISTORY_STATUSES;

  await connectDB();
  const filter = { assignedCollector: collectorId, deletedAt: null, status: { $in: statuses } };

  const [reports, total] = await Promise.all([
    WasteReport.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("serviceZone", "name")
      .select("reportId status serviceZone statusHistory")
      .lean(),
    WasteReport.countDocuments(filter),
  ]);

  const items = reports.map((r) => {
    const history = Array.isArray(r.statusHistory) ? r.statusHistory : [];
    const entry = history.slice().reverse().find((h) => h && h.status === r.status);
    return {
      reportId: r.reportId,
      status: r.status,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      finishedAt: entry && entry.at ? entry.at : null,
      note: entry && entry.note ? entry.note : "",
    };
  });

  return { items: items, total: total };
}
`);

write("app/collector/history/page.js", `
import { requireRole } from "@/lib/auth/guards";
import { listCollectorHistory, HISTORY_STATUSES } from "@/services/collectorHistory";
import { STATUS_LABELS, formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";

export const metadata = { title: "Job History | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/collector/history" + (qs ? "?" + qs : "");
}

export default async function CollectorHistoryPage({ searchParams }) {
  const user = await requireRole(["COLLECTOR"]);
  const sp = await searchParams;
  const status = HISTORY_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  let data = null;
  let loadError = false;
  try {
    // Only this collector's own finished jobs: the id comes from the server session.
    data = await listCollectorHistory(user.id, { status: status, page: page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("Load collector history failed:", err.message);
    loadError = true;
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tabs = [{ label: "All", href: href(1, null), active: !status }].concat(
    HISTORY_STATUSES.map((s) => ({ label: STATUS_LABELS[s], href: href(1, s), active: status === s }))
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Job History</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your finished jobs. Active jobs are under My Jobs. Resident details are never shown here.
        {data ? " Total: " + data.total + "." : ""}
      </p>

      <div className="mt-4">
        <FilterTabs label="Result filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Your history could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && data && data.items.length === 0 && (
        <div className="mt-4">
          <EmptyState>You have no finished jobs yet.</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Report</th>
                <th scope="col" className="py-2 pr-4">Zone</th>
                <th scope="col" className="py-2 pr-4">Result</th>
                <th scope="col" className="py-2 pr-4">Finished</th>
                <th scope="col" className="py-2">Your note</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.reportId} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 font-medium">{i.reportId}</td>
                  <td className="py-2 pr-4">{i.zoneName}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={i.status} label={STATUS_LABELS[i.status]} />
                  </td>
                  <td className="py-2 pr-4">{i.finishedAt ? formatDateTime(i.finishedAt) : "-"}</td>
                  <td className="py-2">{i.note || "-"}</td>
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

write("tests/unit/profileRules.test.js", `
import { describe, it, expect } from "vitest";
import { NAME_MIN, NAME_MAX, normalizeDisplayName, isValidDisplayName } from "@/lib/profileRules";

describe("normalizeDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeDisplayName("  Ayesha    Khan ")).toBe("Ayesha Khan");
    expect(normalizeDisplayName(null)).toBe("");
    expect(normalizeDisplayName(undefined)).toBe("");
  });
});

describe("isValidDisplayName", () => {
  it("accepts normal names, including non-English ones", () => {
    expect(NAME_MIN).toBe(2);
    expect(NAME_MAX).toBe(120);
    ["Ayesha Khan", "Al", "Jean-Luc O'Neil", "Resident 42"].forEach((n) => expect(isValidDisplayName(n)).toBe(true));
    expect(isValidDisplayName("عائشہ خان")).toBe(true);
    expect(isValidDisplayName("x".repeat(120))).toBe(true);
  });

  it("rejects empty, too short and too long names", () => {
    ["", "   ", "a", null, undefined].forEach((n) => expect(isValidDisplayName(n)).toBe(false));
    expect(isValidDisplayName("x".repeat(121))).toBe(false);
  });

  it("rejects names without a letter or number", () => {
    ["!!!", "--", "...", "@#$"].forEach((n) => expect(isValidDisplayName(n)).toBe(false));
  });

  it("rejects angle brackets and control characters", () => {
    expect(isValidDisplayName("<b>Bob</b>")).toBe(false);
    expect(isValidDisplayName("Bad\\u0007Name")).toBe(false);
  });
});
`);

write("tests/integration/profile.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { updateProfileAction } from "@/actions/profile";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

describe("updateProfileAction", () => {
  it("changes only the signed-in resident's name", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherName = other.name;
    signInAs(me);

    const out = await run(() => updateProfileAction(null, form({ name: "  New    Name " })));
    expect(out.result.success).toBeTruthy();

    const saved = await User.findById(me._id).lean();
    expect(saved.name).toBe("New Name");
    expect(saved.email).toBe(me.email);
    expect(saved.role).toBe("RESIDENT");
    expect((await User.findById(other._id).lean()).name).toBe(otherName);
  });

  it("ignores attempts to change the email or the role through the form", async () => {
    const me = await makeUser();
    signInAs(me);
    await run(() =>
      updateProfileAction(null, form({ name: "New Name", email: "hacker@example.com", role: "SUPER_ADMIN", status: "ACTIVE" }))
    );
    const saved = await User.findById(me._id).lean();
    expect(saved.email).toBe(me.email);
    expect(saved.role).toBe("RESIDENT");
  });

  it("accepts a name written in Urdu", async () => {
    const me = await makeUser();
    signInAs(me);
    const out = await run(() => updateProfileAction(null, form({ name: "عائشہ خان" })));
    expect(out.result.success).toBeTruthy();
    expect((await User.findById(me._id).lean()).name).toBe("عائشہ خان");
  });

  it("refuses short, symbol-only, bracketed and very long names", async () => {
    const me = await makeUser();
    signInAs(me);
    const a = await run(() => updateProfileAction(null, form({ name: "a" })));
    expect(a.result.error).toMatch(/at least 2/i);
    const b = await run(() => updateProfileAction(null, form({ name: "!!!" })));
    expect(b.result.error).toMatch(/valid name/i);
    const c = await run(() => updateProfileAction(null, form({ name: "<b>Bob</b>" })));
    expect(c.result.error).toMatch(/valid name/i);
    const d = await run(() => updateProfileAction(null, form({ name: "x".repeat(121) })));
    expect(d.result.error).toMatch(/too long/i);
    expect((await User.findById(me._id).lean()).name).toBe(me.name);
  });

  it("refuses collectors, staff and visitors", async () => {
    for (const role of ["COLLECTOR", "SUPER_ADMIN", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
      expect(out.result.error).toMatch(/permission/i);
      expect((await User.findById(user._id).lean()).name).toBe(user.name);
    }
    signOut();
    const visitor = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
    expect(visitor.result.error).toMatch(/permission/i);
  });

  it("does not change a suspended resident", async () => {
    const me = await makeUser({ status: "SUSPENDED" });
    signInAs(me);
    const out = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
    expect(out.result.error).toMatch(/could not be found/i);
    expect((await User.findById(me._id).lean()).name).toBe(me.name);
  });
});
`);

write("tests/integration/collectorHistory.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listCollectorHistory } from "@/services/collectorHistory";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

async function finished(resident, collector, status, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        {
          assignedCollector: collector._id,
          statusHistory: [
            { status: "ASSIGNED", at: new Date(Date.now() - 5000) },
            { status: status, at: new Date(Date.now() - 1000), note: "Note for " + status },
          ],
        },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listCollectorHistory", () => {
  it("lists only this collector's finished jobs", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    const other = await makeUser({ role: "COLLECTOR" });
    const a = await finished(resident, me, "COLLECTED");
    const b = await finished(resident, me, "UNABLE_TO_COLLECT");
    await finished(resident, other, "COLLECTED");
    await finished(resident, me, "ARRIVED");
    await finished(resident, me, "ASSIGNED");
    const gone = await finished(resident, me, "COLLECTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const result = await listCollectorHistory(String(me._id));
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.reportId).sort()).toEqual([a.reportId, b.reportId].sort());
  });

  it("shows the zone, the finishing time and the collector's own note", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    const zone = await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    await finished(resident, me, "UNABLE_TO_COLLECT", { serviceZone: zone._id });

    const result = await listCollectorHistory(String(me._id));
    expect(result.items[0].zoneName).toBe("Zone A");
    expect(result.items[0].note).toBe("Note for UNABLE_TO_COLLECT");
    expect(result.items[0].finishedAt).toBeTruthy();
  });

  it("filters by result", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    await finished(resident, me, "COLLECTED");
    await finished(resident, me, "UNABLE_TO_COLLECT");
    const only = await listCollectorHistory(String(me._id), { status: "COLLECTED" });
    expect(only.total).toBe(1);
    expect(only.items[0].status).toBe("COLLECTED");
    const ignored = await listCollectorHistory(String(me._id), { status: "HACKED" });
    expect(ignored.total).toBe(2);
  });

  it("pages the results", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    for (let i = 0; i < 3; i++) await finished(resident, me, "COLLECTED");
    const first = await listCollectorHistory(String(me._id), { page: 1, pageSize: 2 });
    const second = await listCollectorHistory(String(me._id), { page: 2, pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
  });

  it("never returns anything about the resident", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    await finished(resident, me, "COLLECTED");
    const text = JSON.stringify(await listCollectorHistory(String(me._id)));
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });

  it("returns an empty result when there are no finished jobs", async () => {
    const me = await makeUser({ role: "COLLECTOR" });
    expect(await listCollectorHistory(String(me._id))).toEqual({ items: [], total: 0 });
  });
});
`);

// ---- Check 3: read every file back (comments are ignored, so a word in a comment cannot trigger a false alarm) ----
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(code)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if (!code.includes("getCurrentUser")) problems.push("missing session check");
    if (!code.includes('user.role !== "RESIDENT"')) problems.push("missing resident-only check");
    if (/\$set:\s*\{[^}]*(role|email|status|passwordHash)/.test(code)) problems.push("must only change the name");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f.startsWith("app/") && !code.includes("requireRole(")) problems.push("missing page role check");
  if (f === "services/collectorHistory.js") {
    if (/reporter/.test(code)) problems.push("service must never select the person who made the report");
    if (/updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|create\(/.test(code)) {
      problems.push("service must be read-only");
    }
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");