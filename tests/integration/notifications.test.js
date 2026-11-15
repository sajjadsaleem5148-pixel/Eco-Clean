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
