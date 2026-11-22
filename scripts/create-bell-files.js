const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/session.js",
  "lib/permissions/roles.js",
  "models/Notification.js",
  "lib/notificationTypes.js",
  "services/notifications.js",
  "components/layout/PortalShell.js",
  "tests/integration/helpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
  "node_modules/lucide-react",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first (notifications and design system scripts):");
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

write("lib/notificationLinks.js", `
import { ADMIN_ROLES } from "@/lib/permissions/roles";

// Where each role reads its notifications. Returns null for a role that has no notifications page.
export function notificationsPathFor(role) {
  if (role === "RESIDENT") return "/dashboard/notifications";
  if (role === "COLLECTOR") return "/collector/notifications";
  if (ADMIN_ROLES.includes(role)) return "/admin/notifications";
  return null;
}

// Text shown next to the bell. Empty when there is nothing to show.
export function formatBadgeCount(count) {
  if (typeof count !== "number" || !Number.isFinite(count)) return "";
  const n = Math.floor(count);
  if (!(n > 0)) return "";
  return n > 99 ? "99+" : String(n);
}
`);

write("services/notificationCount.js", `
import connectDB from "@/lib/db/connect";
import Notification from "@/models/Notification";

// Only a number is returned. It never throws: a database problem gives null and the bell is shown without a count.
export async function unreadCountFor(userId) {
  try {
    await connectDB();
    return await Notification.countDocuments({ user: userId, readAt: null });
  } catch (err) {
    console.error("Unread count failed:", err.message);
    return null;
  }
}
`);

write("components/layout/NotificationBell.js", `
import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCountFor } from "@/services/notificationCount";
import { notificationsPathFor, formatBadgeCount } from "@/lib/notificationLinks";

export default async function NotificationBell() {
  // The id and role come from the server session, never from the URL.
  const user = await getCurrentUser();
  if (!user) return null;
  const href = notificationsPathFor(user.role);
  if (!href) return null;

  const count = await unreadCountFor(user.id);
  const badge = formatBadgeCount(count);
  const label = badge ? "Notifications, " + badge + " unread" : "Notifications";

  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-emerald-300 px-2 text-white hover:bg-emerald-900"
    >
      <Bell size={20} aria-hidden="true" />
      {badge && (
        <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-950">{badge}</span>
      )}
    </Link>
  );
}
`);

write("tests/unit/notificationLinks.test.js", `
import { describe, it, expect } from "vitest";
import { notificationsPathFor, formatBadgeCount } from "@/lib/notificationLinks";

describe("notificationsPathFor", () => {
  it("sends each role to its own notifications page", () => {
    expect(notificationsPathFor("RESIDENT")).toBe("/dashboard/notifications");
    expect(notificationsPathFor("COLLECTOR")).toBe("/collector/notifications");
    ["SUPER_ADMIN", "OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "CONTENT_MANAGER", "READ_ONLY_ANALYST"].forEach((r) => {
      expect(notificationsPathFor(r)).toBe("/admin/notifications");
    });
  });

  it("returns null for an unknown or missing role", () => {
    expect(notificationsPathFor("HACKER")).toBeNull();
    expect(notificationsPathFor(undefined)).toBeNull();
    expect(notificationsPathFor("")).toBeNull();
  });
});

describe("formatBadgeCount", () => {
  it("shows nothing for zero, missing or bad values", () => {
    [0, -3, null, undefined, NaN, "5", Infinity].forEach((v) => expect(formatBadgeCount(v)).toBe(""));
  });

  it("shows the number up to 99 and 99+ above that", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(4500)).toBe("99+");
  });
});
`);

write("tests/integration/notificationCount.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { unreadCountFor } from "@/services/notificationCount";
import Notification from "@/models/Notification";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

function note(userId, extra) {
  return Notification.create(
    Object.assign({ user: userId, type: "SYSTEM", title: "Test title", body: "Test body" }, extra || {})
  );
}

describe("unreadCountFor", () => {
  it("returns zero when the user has no notifications", async () => {
    const user = await makeUser();
    expect(await unreadCountFor(user._id)).toBe(0);
  });

  it("counts only unread notifications of that user", async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await note(mine._id);
    await note(mine._id);
    await note(mine._id, { readAt: new Date() });
    await note(theirs._id);
    await note(theirs._id);
    await note(theirs._id);
    expect(await unreadCountFor(mine._id)).toBe(2);
    expect(await unreadCountFor(theirs._id)).toBe(3);
  });

  it("goes down when a notification is read", async () => {
    const user = await makeUser();
    const n = await note(user._id);
    await note(user._id);
    expect(await unreadCountFor(user._id)).toBe(2);
    await Notification.updateOne({ _id: n._id }, { $set: { readAt: new Date() } });
    expect(await unreadCountFor(user._id)).toBe(1);
  });
});
`);

// ---- Patch PortalShell: import + bell next to the logout button. Backup first, exact-once anchors only. ----
const shellFile = "components/layout/PortalShell.js";
const importAnchor = 'import LogoutButton from "@/components/forms/LogoutButton";';
const importLine = 'import NotificationBell from "@/components/layout/NotificationBell";';
const usageAnchor = "<LogoutButton />";
const usageReplacement =
  '<div className="flex items-center gap-2">\n          <NotificationBell />\n          <LogoutButton />\n        </div>';

function count(text, part) {
  return text.split(part).length - 1;
}

let patchState = "";
let patchWhy = "";
{
  const src = fs.readFileSync(shellFile, "utf8");
  if (src.includes("NotificationBell")) {
    patchState = "already";
  } else if (count(src, importAnchor) !== 1) {
    patchState = "skipped";
    patchWhy = "the LogoutButton import line was not found exactly once";
  } else if (count(src, usageAnchor) !== 1) {
    patchState = "skipped";
    patchWhy = "<LogoutButton /> was not found exactly once";
  } else {
    const backupDir = "scripts/backup-bell";
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, "components__layout__PortalShell.js.bak");
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    let out = src.replace(importAnchor, importAnchor + eol + importLine);
    out = out.replace(usageAnchor, usageReplacement.replace(/\n/g, eol));
    fs.writeFileSync(shellFile, out, "utf8");
    patchState = "wired";
  }
}
console.log("\nHeader patch: " + patchState.toUpperCase() + " (" + shellFile + ")");
if (patchState === "skipped") {
  console.log("WARNING: the bell was NOT added to the header (" + patchWhy + "). Send me components/layout/PortalShell.js.");
}

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
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "components/layout/NotificationBell.js") {
    if (!code.includes("getCurrentUser")) problems.push("the user must come from the server session");
    if (/searchParams|params\./.test(code)) problems.push("the user must never come from the URL");
  }
  if (f === "services/notificationCount.js") {
    if (!code.includes("countDocuments")) problems.push("must only count");
    if (/\.find\(|updateOne|updateMany|deleteOne|deleteMany|create\(/.test(code)) {
      problems.push("must be a read-only count");
    }
  }
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (patchState === "wired") {
  const after = fs.readFileSync(shellFile, "utf8");
  if (count(after, "NotificationBell") < 2) {
    console.log(" FAIL (bell not found in the header after writing): " + shellFile);
    failed++;
  } else {
    console.log(" OK: " + shellFile);
  }
}

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention. The old header is saved in scripts/backup-bell");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked.");
if (patchState === "skipped") console.log("WARNING: the header was not changed. Send me the WARNING line above.");
console.log("Next: npm test, npm run test:integration, npm run build.");