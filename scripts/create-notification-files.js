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
  "lib/permissions/roles.js",
  "lib/reportStatus.js",
  "lib/rewardStatus.js",
  "models/User.js",
  "models/WasteReport.js",
  "models/Complaint.js",
  "models/RewardOrder.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "components/tables/Pagination.js",
  "actions/reports.js",
  "actions/adminReports.js",
  "actions/assignments.js",
  "actions/collectorJobs.js",
  "actions/complaints.js",
  "actions/adminComplaints.js",
  "actions/points.js",
  "actions/rewards.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
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

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/notificationTypes.js", `
export const NOTIFICATION_TYPES = ["REPORT", "JOB", "COMPLAINT", "POINTS", "ORDER", "SYSTEM"];

export const NOTIFICATION_TYPE_LABELS = {
  REPORT: "Report",
  JOB: "Job",
  COMPLAINT: "Complaint",
  POINTS: "Green Points",
  ORDER: "Reward order",
  SYSTEM: "System",
};

// Only a path inside this site is allowed. Full URLs, protocol-relative links and javascript: are dropped.
export function safeLink(link) {
  if (typeof link !== "string") return undefined;
  if (link.startsWith("//")) return undefined;
  if (!/^[/][A-Za-z0-9/_.?=&-]{0,198}$/.test(link)) return undefined;
  return link;
}

export function clip(text, max) {
  const value = String(text == null ? "" : text);
  return value.length > max ? value.slice(0, max) : value;
}
`);

write("models/Notification.js", `
import mongoose from "mongoose";
import { NOTIFICATION_TYPES } from "@/lib/notificationTypes";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 300 },
    link: { type: String, maxlength: 200 },
    readAt: { type: Date, default: null },
    // Stops the same event from creating the same notification twice for one person.
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
`);

write("services/notifications.js", `
import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";
import User from "@/models/User";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import RewardOrder from "@/models/RewardOrder";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { NOTIFICATION_TYPES, safeLink, clip } from "@/lib/notificationTypes";

const MAX_STAFF_RECIPIENTS = 50;

// Creating a notification must never break the real action, so this function never throws.
export async function notifyUser(input) {
  try {
    const data = input || {};
    if (!data.userId || !NOTIFICATION_TYPES.includes(data.type)) return false;
    await connectDB();
    await Notification.create({
      user: data.userId,
      type: data.type,
      title: clip(data.title, 120),
      body: clip(data.body, 300),
      link: safeLink(data.link),
      dedupeKey: data.dedupeKey || undefined,
    });
    return true;
  } catch (err) {
    // 11000 means the same notification already exists, which is fine.
    if (!(err && err.code === 11000)) console.error("Create notification failed:", err.message);
    return false;
  }
}

// Staff who hold a permission, for example reports.verify. Only active accounts.
export async function notifyRoleStaff(permission, payload) {
  try {
    const roles = ADMIN_ROLES.filter((r) => hasPermission(r, permission));
    if (roles.length === 0) return 0;
    await connectDB();
    const staff = await User.find({ role: { $in: roles }, status: "ACTIVE", deletedAt: null })
      .select("_id")
      .limit(MAX_STAFF_RECIPIENTS)
      .lean();
    let sent = 0;
    for (const s of staff) {
      const ok = await notifyUser(Object.assign({}, payload, { userId: s._id }));
      if (ok) sent += 1;
    }
    return sent;
  } catch (err) {
    console.error("Notify staff failed:", err.message);
    return 0;
  }
}

export async function notifyReportOwner(reportId, payload) {
  try {
    await connectDB();
    const report = await WasteReport.findOne({ reportId, deletedAt: null }).select("reporter").lean();
    if (!report) return false;
    return await notifyUser(Object.assign({}, payload, { userId: report.reporter }));
  } catch (err) {
    console.error("Notify report owner failed:", err.message);
    return false;
  }
}

export async function notifyComplaintOwner(ticketNumber, payload) {
  try {
    await connectDB();
    const complaint = await Complaint.findOne({ ticketNumber, deletedAt: null }).select("reporter").lean();
    if (!complaint) return false;
    return await notifyUser(Object.assign({}, payload, { userId: complaint.reporter }));
  } catch (err) {
    console.error("Notify complaint owner failed:", err.message);
    return false;
  }
}

export async function notifyOrderOwner(orderNumber, payload) {
  try {
    await connectDB();
    const order = await RewardOrder.findOne({ orderNumber }).select("user").lean();
    if (!order) return false;
    return await notifyUser(Object.assign({}, payload, { userId: order.user }));
  } catch (err) {
    console.error("Notify order owner failed:", err.message);
    return false;
  }
}

// Always limited to one user's own notifications.
export async function listFor(userId, options) {
  const opts = options || {};
  const pageSize = opts.pageSize || 20;
  const page = Math.max(1, opts.page || 1);
  await connectDB();

  const filter = { user: userId };
  if (opts.unreadOnly) filter.readAt = null;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, readAt: null }),
  ]);

  return {
    total,
    unread,
    items: items.map((n) => ({
      id: n._id.toString(),
      type: n.type,
      title: n.title,
      body: n.body,
      link: safeLink(n.link),
      read: Boolean(n.readAt),
      createdAt: n.createdAt,
    })),
  };
}
`);

write("actions/notifications.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";
import { getCurrentUser } from "@/lib/auth/session";

function refresh() {
  revalidatePath("/dashboard/notifications");
  revalidatePath("/collector/notifications");
  revalidatePath("/admin/notifications");
}

const idSchema = z.object({ id: z.string().regex(/^[a-f\\d]{24}$/i, "Invalid notification") });

export async function markReadAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await connectDB();
    // The owner filter comes from the server session, so nobody can mark another person's notification.
    const res = await Notification.updateOne(
      { _id: parsed.data.id, user: user.id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    if (res.matchedCount === 0) {
      const exists = await Notification.exists({ _id: parsed.data.id, user: user.id });
      if (!exists) return { error: "Notification not found." };
    }
  } catch (err) {
    console.error("Mark read failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Marked as read." };
}

export async function markAllReadAction() {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };

  try {
    await connectDB();
    await Notification.updateMany({ user: user.id, readAt: null }, { $set: { readAt: new Date() } });
  } catch (err) {
    console.error("Mark all read failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "All notifications marked as read." };
}
`);

write("components/forms/NotificationForms.js", `
"use client";

import { useActionState } from "react";
import { markReadAction, markAllReadAction } from "@/actions/notifications";

const smallButton = "min-h-10 rounded-md border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-900 disabled:opacity-50";

export function MarkReadButton({ id }) {
  const [state, formAction, pending] = useActionState(markReadAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : "Mark as read"}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}

export function MarkAllReadButton() {
  const [state, formAction, pending] = useActionState(markAllReadAction, null);

  return (
    <form action={formAction} className="inline-block">
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : "Mark all as read"}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
`);

write("components/dashboard/NotificationCenter.js", `
import Link from "next/link";
import { listFor } from "@/services/notifications";
import { NOTIFICATION_TYPE_LABELS, safeLink } from "@/lib/notificationTypes";
import { formatDateTime } from "@/lib/reportStatus";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";
import Pagination from "@/components/tables/Pagination";
import { MarkReadButton, MarkAllReadButton } from "@/components/forms/NotificationForms";

const PAGE_SIZE = 20;

function href(basePath, page, unreadOnly) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("filter", "unread");
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return basePath + (qs ? "?" + qs : "");
}

// userId must always come from the server session, never from the URL.
export default async function NotificationCenter({ userId, basePath, sp }) {
  const unreadOnly = sp && sp.filter === "unread";
  const page = Math.max(1, parseInt(sp && sp.page, 10) || 1);

  let data = null;
  let loadError = false;
  try {
    data = await listFor(userId, { unreadOnly, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("Load notifications failed:", err.message);
    loadError = true;
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tabs = [
    { label: "All", href: href(basePath, 1, false), active: !unreadOnly },
    { label: "Unread", href: href(basePath, 1, true), active: Boolean(unreadOnly) },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {data && <p className="mt-1 text-sm text-gray-600">Unread: {data.unread}</p>}
        </div>
        {data && data.unread > 0 && <MarkAllReadButton />}
      </div>
      <p className="mt-2 text-xs text-gray-600">
        These are in-app notifications only. No email or SMS is sent.
      </p>

      <div className="mt-4">
        <FilterTabs label="Notification filter" items={tabs} />
      </div>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Notifications could not be loaded. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && data && data.items.length === 0 && (
        <div className="mt-4">
          <EmptyState>{unreadOnly ? "You have no unread notifications." : "You have no notifications yet."}</EmptyState>
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {data.items.map((n) => {
            const link = safeLink(n.link);
            return (
              <li
                key={n.id}
                className={"rounded-md border p-4 " + (n.read ? "border-gray-200" : "border-emerald-300 bg-emerald-50")}
              >
                <p className="text-xs font-semibold text-emerald-800">
                  {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                  {!n.read && " | Unread"}
                </p>
                <p className="mt-1 font-semibold text-gray-900">{n.title}</p>
                <p className="mt-1 text-sm text-gray-700">{n.body}</p>
                <p className="mt-1 text-xs text-gray-600">{formatDateTime(n.createdAt)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {link && (
                    <Link href={link} className="text-sm font-semibold text-emerald-800 underline">Open</Link>
                  )}
                  {!n.read && <MarkReadButton id={n.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        page={page}
        pages={pages}
        prevHref={href(basePath, page - 1, unreadOnly)}
        nextHref={href(basePath, page + 1, unreadOnly)}
      />
    </section>
  );
}
`);

write("app/dashboard/notifications/page.js", `
import { requireRole } from "@/lib/auth/guards";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentNotificationsPage({ searchParams }) {
  const user = await requireRole(["RESIDENT"]);
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/dashboard/notifications" sp={sp} />;
}
`);

write("app/collector/notifications/page.js", `
import { requireRole } from "@/lib/auth/guards";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorNotificationsPage({ searchParams }) {
  const user = await requireRole(["COLLECTOR"]);
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/collector/notifications" sp={sp} />;
}
`);

write("app/admin/(panel)/notifications/page.js", `
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }) {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/admin/notifications" sp={sp} />;
}
`);

write("tests/unit/notificationTypes.test.js", `
import { describe, it, expect } from "vitest";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, safeLink, clip } from "@/lib/notificationTypes";

describe("safeLink", () => {
  it("keeps paths inside the site", () => {
    expect(safeLink("/dashboard/reports/ECR-20261101-ABCDEF12")).toBe("/dashboard/reports/ECR-20261101-ABCDEF12");
    expect(safeLink("/admin/orders?status=PENDING")).toBe("/admin/orders?status=PENDING");
  });

  it("drops full URLs, protocol-relative links and script links", () => {
    expect(safeLink("https://evil.example")).toBeUndefined();
    expect(safeLink("http://evil.example/x")).toBeUndefined();
    expect(safeLink("//evil.example")).toBeUndefined();
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("/ok<script>")).toBeUndefined();
  });

  it("drops empty, missing and non-text values", () => {
    expect(safeLink("")).toBeUndefined();
    expect(safeLink(undefined)).toBeUndefined();
    expect(safeLink(null)).toBeUndefined();
    expect(safeLink(42)).toBeUndefined();
  });

  it("drops a path that is too long", () => {
    expect(safeLink("/" + "a".repeat(300))).toBeUndefined();
  });
});

describe("notification settings", () => {
  it("has a label for every type", () => {
    NOTIFICATION_TYPES.forEach((t) => expect(NOTIFICATION_TYPE_LABELS[t]).toBeTruthy());
  });

  it("clips long text and tolerates missing text", () => {
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip("abc", 10)).toBe("abc");
    expect(clip(undefined, 5)).toBe("");
  });
});
`);

write("tests/integration/notifications.test.js", `
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

import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { notifyUser, notifyRoleStaff, notifyReportOwner, listFor } from "@/services/notifications";
import { markReadAction, markAllReadAction } from "@/actions/notifications";
import Notification from "@/models/Notification";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function payload(userId, extra) {
  return Object.assign(
    { userId: userId, type: "REPORT", title: "Test title", body: "Test body", link: "/dashboard/reports" },
    extra || {}
  );
}

describe("notifyUser", () => {
  it("creates an unread notification", async () => {
    const user = await makeUser();
    expect(await notifyUser(payload(user._id))).toBe(true);
    const saved = await Notification.find({ user: user._id }).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0].readAt).toBeNull();
    expect(saved[0].link).toBe("/dashboard/reports");
  });

  it("does not create the same notification twice for one person, but does for another", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await notifyUser(payload(a._id, { dedupeKey: "same-event" }));
    await notifyUser(payload(a._id, { dedupeKey: "same-event" }));
    await notifyUser(payload(b._id, { dedupeKey: "same-event" }));
    expect(await Notification.countDocuments({ user: a._id })).toBe(1);
    expect(await Notification.countDocuments({ user: b._id })).toBe(1);
  });

  it("creates one notification when the same event arrives many times at once", async () => {
    const user = await makeUser();
    await Promise.all(
      Array.from({ length: 6 }, () => notifyUser(payload(user._id, { dedupeKey: "burst" })))
    );
    expect(await Notification.countDocuments({ user: user._id })).toBe(1);
  });

  it("drops an unsafe link but still creates the notification", async () => {
    const user = await makeUser();
    for (const link of ["https://evil.example", "//evil.example", "javascript:alert(1)"]) {
      await notifyUser(payload(user._id, { link: link }));
    }
    const saved = await Notification.find({ user: user._id }).lean();
    expect(saved).toHaveLength(3);
    saved.forEach((n) => expect(n.link).toBeUndefined());
  });

  it("never throws on bad input", async () => {
    expect(await notifyUser({ title: "No user" })).toBe(false);
    expect(await notifyUser({ userId: newId(), type: "NOT_A_TYPE", title: "x", body: "y" })).toBe(false);
    expect(await Notification.countDocuments({})).toBe(0);
  });
});

describe("notifyRoleStaff", () => {
  it("reaches only active staff who hold the permission", async () => {
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    const ops = await makeUser({ role: "OPERATIONS_MANAGER" });
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });
    const suspended = await makeUser({ role: "OPERATIONS_MANAGER", status: "SUSPENDED" });
    const resident = await makeUser();

    const sent = await notifyRoleStaff("reports.verify", payload(null, { userId: undefined, dedupeKey: "rp-1" }));
    expect(sent).toBe(2);

    expect(await Notification.countDocuments({ user: admin._id })).toBe(1);
    expect(await Notification.countDocuments({ user: ops._id })).toBe(1);
    expect(await Notification.countDocuments({ user: complaints._id })).toBe(0);
    expect(await Notification.countDocuments({ user: suspended._id })).toBe(0);
    expect(await Notification.countDocuments({ user: resident._id })).toBe(0);
  });
});

describe("notifyReportOwner", () => {
  it("goes to the resident who made the report", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const report = await makeReport(owner._id, newId(), "VERIFIED");
    expect(await notifyReportOwner(report.reportId, payload(null, { userId: undefined }))).toBe(true);
    expect(await Notification.countDocuments({ user: owner._id })).toBe(1);
    expect(await Notification.countDocuments({ user: other._id })).toBe(0);
  });

  it("returns false for an unknown report", async () => {
    expect(await notifyReportOwner("ECR-20261101-00000000", payload(null, { userId: undefined }))).toBe(false);
  });
});

describe("listFor", () => {
  it("returns only that user's notifications and counts unread", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await notifyUser(payload(mine._id, { title: "Mine one" }));
    await notifyUser(payload(mine._id, { title: "Mine two" }));
    await notifyUser(payload(theirs._id, { title: "Not mine" }));
    await Notification.updateOne({ user: mine._id, title: "Mine one" }, { $set: { readAt: new Date() } });

    const all = await listFor(mine._id, {});
    expect(all.total).toBe(2);
    expect(all.unread).toBe(1);
    expect(all.items.map((n) => n.title).sort()).toEqual(["Mine one", "Mine two"]);

    const unread = await listFor(mine._id, { unreadOnly: true });
    expect(unread.items.map((n) => n.title)).toEqual(["Mine two"]);
  });
});

describe("markReadAction and markAllReadAction", () => {
  it("lets a user mark only their own notification", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    await notifyUser(payload(owner._id));
    const n = await Notification.findOne({ user: owner._id }).lean();

    signInAs(other);
    const denied = await run(() => markReadAction(null, form({ id: String(n._id) })));
    expect(denied.result.error).toMatch(/not found/i);
    expect((await Notification.findById(n._id).lean()).readAt).toBeNull();

    signInAs(owner);
    const ok = await run(() => markReadAction(null, form({ id: String(n._id) })));
    expect(ok.result.success).toBeTruthy();
    expect((await Notification.findById(n._id).lean()).readAt).toBeTruthy();
  });

  it("does not change the time of a notification that is already read", async () => {
    const owner = await makeUser();
    await notifyUser(payload(owner._id));
    const n = await Notification.findOne({ user: owner._id }).lean();
    signInAs(owner);
    await run(() => markReadAction(null, form({ id: String(n._id) })));
    const first = (await Notification.findById(n._id).lean()).readAt.getTime();
    const again = await run(() => markReadAction(null, form({ id: String(n._id) })));
    expect(again.result.success).toBeTruthy();
    expect((await Notification.findById(n._id).lean()).readAt.getTime()).toBe(first);
  });

  it("refuses a visitor who is not logged in and a malformed id", async () => {
    const owner = await makeUser();
    await notifyUser(payload(owner._id));
    const n = await Notification.findOne({ user: owner._id }).lean();

    const a = await run(() => markReadAction(null, form({ id: String(n._id) })));
    expect(a.result.error).toMatch(/log in/i);
    signInAs(owner);
    const b = await run(() => markReadAction(null, form({ id: "not-an-id" })));
    expect(b.result.error).toMatch(/invalid/i);
    expect((await Notification.findById(n._id).lean()).readAt).toBeNull();
  });

  it("marks all of one user's notifications and nobody else's", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await notifyUser(payload(mine._id));
    await notifyUser(payload(mine._id));
    await notifyUser(payload(theirs._id));

    signInAs(mine);
    const out = await run(() => markAllReadAction());
    expect(out.result.success).toBeTruthy();
    expect(await Notification.countDocuments({ user: mine._id, readAt: null })).toBe(0);
    expect(await Notification.countDocuments({ user: theirs._id, readAt: null })).toBe(1);
  });
});
`);

// ---- Wire events into existing actions (one line each, with backups) ----
const backupDir = "scripts/backup-notifications";
fs.mkdirSync(backupDir, { recursive: true });

function count(text, part) {
  return text.split(part).length - 1;
}

const wiring = [];

function wire(file, importAnchor, importLine, callAnchor, callLines) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("@/services/notifications")) {
    wiring.push({ file: file, state: "already" });
    return;
  }
  if (count(src, importAnchor) !== 1) {
    wiring.push({ file: file, state: "skipped", why: "import line not found exactly once" });
    return;
  }
  if (count(src, callAnchor) !== 1) {
    wiring.push({ file: file, state: "skipped", why: "return line not found exactly once" });
    return;
  }
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const backup = path.join(backupDir, file.replace(/[\\/]/g, "__") + ".bak");
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");

  let out = src.replace(importAnchor, importAnchor + eol + importLine);
  out = out.replace(callAnchor, callLines.join(eol + "  ") + eol + "  " + callAnchor);
  fs.writeFileSync(file, out, "utf8");
  wiring.push({ file: file, state: "wired" });
}

wire(
  "actions/reports.js",
  'import { getCurrentUser } from "@/lib/auth/session";',
  'import { notifyRoleStaff } from "@/services/notifications";',
  'redirect("/dashboard/reports/" + reportId);',
  [
    'await notifyRoleStaff("reports.verify", {',
    '  type: "REPORT",',
    '  title: "New garbage report",',
    '  body: "Report " + reportId + " is waiting for review.",',
    '  link: "/admin/reports/" + reportId,',
    '  dedupeKey: "report-new:" + reportId,',
    "});",
  ]
);

wire(
  "actions/adminReports.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyReportOwner } from "@/services/notifications";',
  'return { success: "Report updated." };',
  [
    'if (decision === "VERIFIED" || decision === "REJECTED") {',
    "  await notifyReportOwner(reportId, {",
    '    type: "REPORT",',
    '    title: decision === "VERIFIED" ? "Your report was verified" : "Your report was rejected",',
    '    body: decision === "VERIFIED"',
    '      ? "Staff verified report " + reportId + "."',
    '      : "Report " + reportId + " was rejected. The reason is in the status history.",',
    '    link: "/dashboard/reports/" + reportId,',
    "  });",
    "}",
  ]
);

wire(
  "actions/assignments.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyUser } from "@/services/notifications";',
  'return { success: "Collector assigned." };',
  [
    "await notifyUser({",
    "  userId: collectorId,",
    '  type: "JOB",',
    '  title: "New job assigned",',
    '  body: "Job " + reportId + " was assigned to you.",',
    '  link: "/collector/jobs/" + reportId,',
    "});",
  ]
);

wire(
  "actions/collectorJobs.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyReportOwner } from "@/services/notifications";',
  'return { success: "Job updated." };',
  [
    "const residentNotes = {",
    '  ON_THE_WAY: ["Collector is on the way", "A collector is on the way for report "],',
    '  ARRIVED: ["Collector arrived", "A collector arrived for report "],',
    '  COLLECTED: ["Your waste was collected", "Report "],',
    '  UNABLE_TO_COLLECT: ["Pickup could not be completed", "The pickup for report "],',
    "};",
    "if (residentNotes[step]) {",
    "  await notifyReportOwner(reportId, {",
    '    type: "REPORT",',
    "    title: residentNotes[step][0],",
    "    body:",
    "      residentNotes[step][1] +",
    "      reportId +",
    '      (step === "COLLECTED"',
    '        ? " was marked as collected."',
    '        : step === "UNABLE_TO_COLLECT"',
    '          ? " could not be completed. See the status history."',
    '          : "."),',
    '    link: "/dashboard/reports/" + reportId,',
    "  });",
    "}",
  ]
);

wire(
  "actions/complaints.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyRoleStaff } from "@/services/notifications";',
  'redirect("/dashboard/complaints/" + ticket);',
  [
    'await notifyRoleStaff("complaints.resolve", {',
    '  type: "COMPLAINT",',
    '  title: "New complaint",',
    '  body: "Complaint " + ticket + " was submitted.",',
    '  link: "/admin/complaints/" + ticket,',
    '  dedupeKey: "complaint-new:" + ticket,',
    "});",
  ]
);

wire(
  "actions/adminComplaints.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyComplaintOwner } from "@/services/notifications";',
  'return { success: "Complaint updated." };',
  [
    'if (decision === "RESOLVED" || decision === "REJECTED") {',
    "  await notifyComplaintOwner(ticketNumber, {",
    '    type: "COMPLAINT",',
    '    title: decision === "RESOLVED" ? "Your complaint was resolved" : "Your complaint was rejected",',
    '    body: "Complaint " + ticketNumber + " has a new update. Open it to read the details.",',
    '    link: "/dashboard/complaints/" + ticketNumber,',
    "  });",
    "}",
  ]
);

wire(
  "actions/points.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyReportOwner } from "@/services/notifications";',
  'return { success: "Points awarded." };',
  [
    "await notifyReportOwner(reportId, {",
    '  type: "POINTS",',
    '  title: "Green Points awarded",',
    '  body: "Points were added to your account for report " + reportId + ".",',
    '  link: "/dashboard/green-points",',
    "});",
  ]
);

wire(
  "actions/rewards.js",
  'import { writeAudit } from "@/lib/audit/log";',
  'import { notifyOrderOwner } from "@/services/notifications";',
  'return { success: "Order updated." };',
  [
    "await notifyOrderOwner(orderNumber, {",
    '  type: "ORDER",',
    '  title: "Your reward order was updated",',
    '  body: "Order " + orderNumber + " has a new status. Open your orders to see it.",',
    '  link: "/dashboard/orders",',
    "});",
  ]
);

console.log("\nEvent wiring:");
wiring.forEach((w) => {
  if (w.state === "wired") console.log(" WIRED   " + w.file);
  else if (w.state === "already") console.log(" ALREADY " + w.file);
  else console.log(" WARNING " + w.file + " was NOT wired (" + w.why + ")");
});

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if (!src.includes("getCurrentUser")) problems.push("missing session check");
    if (!src.includes("user: user.id")) problems.push("missing owner filter");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f.startsWith("app/") && !src.includes("requireRole(")) problems.push("missing page role check");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

wiring.forEach((w) => {
  if (w.state === "wired") {
    const src = fs.readFileSync(w.file, "utf8");
    if (!src.includes("@/services/notifications")) {
      console.log(" FAIL (wiring not found after writing): " + w.file);
      failed++;
    }
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention. Backups of changed actions: " + backupDir);
  process.exit(1);
}
const notWired = wiring.filter((w) => w.state === "skipped").length;
console.log("\nALL OK: " + written.length + " files written and checked.");
if (notWired > 0) {
  console.log("WARNING: " + notWired + " event(s) were not wired. Send me the WARNING lines above.");
}
console.log("Now run: npm test, npm run test:integration, npm run build.");