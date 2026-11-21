const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "lib/auth/guards.js",
  "lib/complaintStatus.js",
  "models/Complaint.js",
  "models/ContactMessage.js",
  "components/dashboard/StatCard.js",
  "components/ui/ErrorNotice.js",
  "tests/integration/helpers.js",
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

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/supportOverview.js", `
const HOUR_MS = 60 * 60 * 1000;

// Whole hours since a date. Returns null when the date is missing or not valid.
export function waitingHours(date, now) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const current = (now || new Date()).getTime();
  return Math.max(0, Math.floor((current - then.getTime()) / HOUR_MS));
}

export function hoursText(hours) {
  return hours === null || hours === undefined ? null : hours + " h";
}
`);

write("services/supportOverview.js", `
import connectDB from "@/lib/db/connect";
import Complaint from "@/models/Complaint";
import ContactMessage from "@/models/ContactMessage";
import { OPEN_STATUSES } from "@/lib/complaintStatus";
import { waitingHours } from "@/lib/supportOverview";

// Counts only. No name, email, message text or id of any person is selected or returned.
export async function getSupportOverview(now) {
  await connectDB();
  const open = { deletedAt: null, status: { $in: OPEN_STATUSES } };

  const [openComplaints, escalated, highPriority, unassigned, newMessages, activeMessages, oldestNew] =
    await Promise.all([
      Complaint.countDocuments(open),
      Complaint.countDocuments({ deletedAt: null, status: "ESCALATED" }),
      Complaint.countDocuments(Object.assign({}, open, { priority: "HIGH" })),
      Complaint.countDocuments(Object.assign({}, open, { assignedTo: null })),
      ContactMessage.countDocuments({ deletedAt: null, status: "NEW" }),
      ContactMessage.countDocuments({ deletedAt: null, status: "IN_PROGRESS" }),
      ContactMessage.findOne({ deletedAt: null, status: "NEW" }).sort({ createdAt: 1 }).select("createdAt").lean(),
    ]);

  return {
    openComplaints: openComplaints,
    escalated: escalated,
    highPriority: highPriority,
    unassigned: unassigned,
    newMessages: newMessages,
    messagesInProgress: activeMessages,
    oldestNewMessageHours: oldestNew ? waitingHours(oldestNew.createdAt, now) : null,
  };
}
`);

write("app/admin/(panel)/support/page.js", `
import { requirePermission } from "@/lib/auth/guards";
import { getSupportOverview } from "@/services/supportOverview";
import { hoursText } from "@/lib/supportOverview";
import StatCard from "@/components/dashboard/StatCard";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Support Overview | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requirePermission("complaints.resolve");

  let data = null;
  let loadError = false;
  try {
    data = await getSupportOverview();
  } catch (err) {
    console.error("Load support overview failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Support Overview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Live counts of complaints and contact messages. This page is read-only and shows no names, emails or message
          text. Open the linked pages to work on a case.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Support data could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
      </section>

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Complaints</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Open complaints" value={data.openComplaints} href="/admin/complaints" />
              <StatCard label="Escalated" value={data.escalated} href="/admin/complaints?status=ESCALATED" />
              <StatCard label="High priority (open)" value={data.highPriority} href="/admin/complaints" />
              <StatCard label="Open and not assigned" value={data.unassigned} href="/admin/complaints" />
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Contact messages</h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              <StatCard label="New messages" value={data.newMessages} href="/admin/contact-messages?status=NEW" />
              <StatCard
                label="In progress"
                value={data.messagesInProgress}
                href="/admin/contact-messages?status=IN_PROGRESS"
              />
              <StatCard
                label="Oldest new message has waited"
                value={hoursText(data.oldestNewMessageHours)}
                href="/admin/contact-messages?status=NEW"
              />
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
`);

write("tests/unit/supportOverview.test.js", `
import { describe, it, expect } from "vitest";
import { waitingHours, hoursText } from "@/lib/supportOverview";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("waitingHours", () => {
  it("counts whole hours", () => {
    expect(waitingHours(new Date("2026-11-20T09:30:00Z"), NOW)).toBe(2);
    expect(waitingHours(new Date("2026-11-19T12:00:00Z"), NOW)).toBe(24);
  });

  it("never goes below zero", () => {
    expect(waitingHours(new Date("2026-11-21T12:00:00Z"), NOW)).toBe(0);
  });

  it("returns null for a missing or bad date", () => {
    expect(waitingHours(undefined, NOW)).toBeNull();
    expect(waitingHours(null, NOW)).toBeNull();
    expect(waitingHours("not a date", NOW)).toBeNull();
  });
});

describe("hoursText", () => {
  it("formats hours and leaves a missing value empty", () => {
    expect(hoursText(5)).toBe("5 h");
    expect(hoursText(0)).toBe("0 h");
    expect(hoursText(null)).toBeNull();
    expect(hoursText(undefined)).toBeNull();
  });
});
`);

write("tests/integration/supportOverview.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { getSupportOverview } from "@/services/supportOverview";
import Complaint from "@/models/Complaint";
import ContactMessage from "@/models/ContactMessage";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

let seq = 0;
function makeComplaint(resident, overrides) {
  seq += 1;
  return Complaint.create(
    Object.assign(
      {
        ticketNumber: "ECC-20261101-" + seq.toString(16).toUpperCase().padStart(8, "0"),
        reporter: resident._id,
        category: "OTHER",
        description: "Test complaint description",
        status: "SUBMITTED",
      },
      overrides || {}
    )
  );
}

function makeMessage(overrides) {
  seq += 1;
  return ContactMessage.create(
    Object.assign(
      {
        reference: "CM-20261101-" + seq.toString(16).toUpperCase().padStart(8, "0"),
        name: "Visitor Name",
        email: "visitor" + seq + "@example.test",
        subject: "A test subject",
        category: "GENERAL",
        message: "A test message that is long enough",
        status: "NEW",
      },
      overrides || {}
    )
  );
}

describe("getSupportOverview", () => {
  it("returns zeros on an empty database", async () => {
    expect(await getSupportOverview()).toEqual({
      openComplaints: 0,
      escalated: 0,
      highPriority: 0,
      unassigned: 0,
      newMessages: 0,
      messagesInProgress: 0,
      oldestNewMessageHours: null,
    });
  });

  it("counts open complaints only and not resolved, rejected or deleted ones", async () => {
    const resident = await makeUser();
    await makeComplaint(resident, { status: "SUBMITTED" });
    await makeComplaint(resident, { status: "IN_PROGRESS" });
    await makeComplaint(resident, { status: "RESOLVED" });
    await makeComplaint(resident, { status: "REJECTED" });
    await makeComplaint(resident, { status: "SUBMITTED", deletedAt: new Date() });
    const data = await getSupportOverview();
    expect(data.openComplaints).toBe(2);
  });

  it("counts escalated, high priority and unassigned complaints", async () => {
    const resident = await makeUser();
    const agent = await makeUser({ role: "SUPPORT_AGENT" });
    await makeComplaint(resident, { status: "ESCALATED", priority: "HIGH" });
    await makeComplaint(resident, { status: "ASSIGNED", assignedTo: agent._id });
    await makeComplaint(resident, { status: "SUBMITTED" });
    const data = await getSupportOverview();
    expect(data.openComplaints).toBe(3);
    expect(data.escalated).toBe(1);
    expect(data.highPriority).toBe(1);
    expect(data.unassigned).toBe(2);
  });

  it("counts contact messages and the wait of the oldest new one", async () => {
    const now = new Date();
    const old = await makeMessage();
    await ContactMessage.collection.updateOne(
      { _id: old._id },
      { $set: { createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) } }
    );
    await makeMessage();
    await makeMessage({ status: "IN_PROGRESS" });
    await makeMessage({ status: "CLOSED" });
    await makeMessage({ deletedAt: new Date() });

    const data = await getSupportOverview(now);
    expect(data.newMessages).toBe(2);
    expect(data.messagesInProgress).toBe(1);
    expect(data.oldestNewMessageHours).toBe(5);
  });

  it("never returns a name, an email or a message text", async () => {
    const resident = await makeUser();
    await makeComplaint(resident);
    const msg = await makeMessage();
    const text = JSON.stringify(await getSupportOverview());
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(msg.email)).toBe(false);
    expect(text.includes(msg.message)).toBe(false);
  });
});
`);

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
  if (f.startsWith("app/") && /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/support/page.js") {
    if (!src.includes('requirePermission("complaints.resolve")')) problems.push("missing page permission check");
    if (/useActionState|updateOne|findOneAndUpdate/.test(src)) problems.push("page must be read-only");
  }
  if (f === "services/supportOverview.js") {
    if (/\.find\(|reporter|email|body/.test(src)) problems.push("service must return counts only");
    if (/updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|create\(/.test(src)) {
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