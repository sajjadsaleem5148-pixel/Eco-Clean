const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "tests/integration/helpers.js",
  "vitest.integration.config.mjs",
  "actions/reports.js",
  "actions/adminReports.js",
  "actions/assignments.js",
  "actions/collectorJobs.js",
  "actions/complaints.js",
  "actions/adminComplaints.js",
  "lib/auth/guards.js",
  "lib/reportTransitions.js",
  "lib/complaintStatus.js",
  "models/WasteReport.js",
  "models/WasteCategory.js",
  "models/ServiceZone.js",
  "models/Complaint.js",
  "models/ComplaintMessage.js",
  "models/AuditLog.js",
  "models/RateLimit.js",
  "node_modules/vitest",
  "node_modules/mongodb-memory-server",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

// The WasteReport model must have the assignment field (added by the collector script).
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

write("tests/integration/actionHelpers.js", `
// Helpers for testing server actions. The mocked session reads the user from globalThis.

export function signInAs(user) {
  globalThis.__ecoUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function signOut() {
  globalThis.__ecoUser = null;
}

export function form(fields) {
  const data = new FormData();
  Object.keys(fields).forEach((key) => {
    if (fields[key] !== undefined && fields[key] !== null) data.set(key, fields[key]);
  });
  return data;
}

// Runs an action. A redirect (which Next.js implements as a thrown error) is returned as { redirect }.
export async function run(fn) {
  try {
    return { result: await fn() };
  } catch (err) {
    if (err && err.message === "NEXT_REDIRECT") return { redirect: err.url };
    throw err;
  }
}
`);

write("tests/integration/reports.test.js", `
import { randomUUID } from "node:crypto";
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

import {
  connectTestDb,
  clearDb,
  disconnectTestDb,
  makeUser,
  makeReport,
  newId,
} from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createReportAction } from "@/actions/reports";
import { reviewReportAction } from "@/actions/adminReports";
import { assignCollectorAction } from "@/actions/assignments";
import { updateJobAction } from "@/actions/collectorJobs";
import WasteReport from "@/models/WasteReport";
import WasteCategory from "@/models/WasteCategory";
import ServiceZone from "@/models/ServiceZone";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

async function makeZone(name) {
  return ServiceZone.create({ name: name, slug: name.toLowerCase().replace(/ /g, "-") });
}

async function world() {
  const resident = await makeUser();
  const category = await WasteCategory.create({ key: "green", name: "Green bag", color: "#047857" });
  const zone = await makeZone("Zone A");
  return { resident, category, zone };
}

function reportForm(w, overrides) {
  return form(
    Object.assign(
      {
        category: String(w.category._id),
        serviceZone: String(w.zone._id),
        description: "A pile of waste near the corner shop",
        address: "12 Main Street",
        idempotencyKey: randomUUID(),
      },
      overrides || {}
    )
  );
}

describe("createReportAction", () => {
  it("creates a report with a unique ID and a first history entry", async () => {
    const w = await world();
    signInAs(w.resident);
    const out = await run(() => createReportAction(null, reportForm(w)));
    expect(out.redirect.startsWith("/dashboard/reports/ECR-")).toBe(true);

    const saved = await WasteReport.find({ reporter: w.resident._id }).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("SUBMITTED");
    expect(saved[0].statusHistory).toHaveLength(1);
    expect(out.redirect.endsWith(saved[0].reportId)).toBe(true);
  });

  it("refuses a visitor who is not logged in", async () => {
    const w = await world();
    const out = await run(() => createReportAction(null, reportForm(w)));
    expect(out.result.error).toMatch(/log in/i);
    expect(await WasteReport.countDocuments({})).toBe(0);
  });

  it("refuses a staff account", async () => {
    const w = await world();
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    signInAs(admin);
    const out = await run(() => createReportAction(null, reportForm(w)));
    expect(out.result.error).toMatch(/resident/i);
    expect(await WasteReport.countDocuments({})).toBe(0);
  });

  it("rejects a description that is too short", async () => {
    const w = await world();
    signInAs(w.resident);
    const out = await run(() => createReportAction(null, reportForm(w, { description: "short" })));
    expect(out.result.error).toMatch(/at least 10/);
    expect(await WasteReport.countDocuments({})).toBe(0);
  });

  it("refuses an inactive zone", async () => {
    const w = await world();
    await ServiceZone.updateOne({ _id: w.zone._id }, { $set: { status: "INACTIVE" } });
    signInAs(w.resident);
    const out = await run(() => createReportAction(null, reportForm(w)));
    expect(out.result.error).toMatch(/not available/i);
    expect(await WasteReport.countDocuments({})).toBe(0);
  });

  it("flags a possible duplicate for the same zone, category and address", async () => {
    const w = await world();
    signInAs(w.resident);
    await run(() => createReportAction(null, reportForm(w, { address: "12 Main Street" })));
    await run(() => createReportAction(null, reportForm(w, { address: "  12   MAIN street " })));
    await run(() => createReportAction(null, reportForm(w, { address: "99 Other Road" })));

    const all = await WasteReport.find({}).sort({ _id: 1 }).lean();
    expect(all).toHaveLength(3);
    expect(all[0].possibleDuplicateOf).toBeUndefined();
    expect(String(all[1].possibleDuplicateOf)).toBe(String(all[0]._id));
    expect(all[2].possibleDuplicateOf).toBeUndefined();
  });

  it("creates one report when the same form key is sent twice", async () => {
    const w = await world();
    signInAs(w.resident);
    const key = randomUUID();
    const first = await run(() => createReportAction(null, reportForm(w, { idempotencyKey: key })));
    const second = await run(() => createReportAction(null, reportForm(w, { idempotencyKey: key })));
    expect(second.redirect).toBe(first.redirect);
    expect(await WasteReport.countDocuments({ reporter: w.resident._id })).toBe(1);
  });

  it("creates one report when the same form key arrives many times at once", async () => {
    const w = await world();
    signInAs(w.resident);
    const key = randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () => run(() => createReportAction(null, reportForm(w, { idempotencyKey: key }))))
    );
    expect(await WasteReport.countDocuments({ reporter: w.resident._id })).toBe(1);
  });

  it("limits a resident to five reports per hour", async () => {
    const w = await world();
    signInAs(w.resident);
    const outcomes = [];
    for (let i = 1; i <= 6; i++) {
      outcomes.push(await run(() => createReportAction(null, reportForm(w, { address: "Street number " + i }))));
    }
    expect(outcomes.slice(0, 5).every((o) => typeof o.redirect === "string")).toBe(true);
    expect(outcomes[5].result.error).toMatch(/too many/i);
    expect(await WasteReport.countDocuments({})).toBe(5);
  });
});

async function submittedReport() {
  const resident = await makeUser();
  const report = await makeReport(resident._id, newId(), "SUBMITTED");
  return { resident, report };
}

function reviewForm(reportId, decision, reason) {
  return form({ reportId: reportId, decision: decision, reason: reason });
}

async function statusOf(report) {
  const saved = await WasteReport.findById(report._id).lean();
  return saved.status;
}

describe("reviewReportAction", () => {
  it("lets an operations manager verify a report and writes an audit entry", async () => {
    const { report } = await submittedReport();
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);
    const out = await run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED")));
    expect(out.result.success).toBeTruthy();
    expect(await statusOf(report)).toBe("VERIFIED");
    const saved = await WasteReport.findById(report._id).lean();
    expect(saved.statusHistory[saved.statusHistory.length - 1].status).toBe("VERIFIED");
    expect(await AuditLog.countDocuments({ action: "report.review.verified" })).toBe(1);
  });

  it("requires a real reason to reject", async () => {
    const { report } = await submittedReport();
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    const none = await run(() => reviewReportAction(null, reviewForm(report.reportId, "REJECTED")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => reviewReportAction(null, reviewForm(report.reportId, "REJECTED", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect(await statusOf(report)).toBe("SUBMITTED");

    const good = await run(() =>
      reviewReportAction(null, reviewForm(report.reportId, "REJECTED", "Photo shows a private garden"))
    );
    expect(good.result.success).toBeTruthy();
    expect(await statusOf(report)).toBe("REJECTED");
  });

  it("refuses a resident, a complaints manager and a logged-out visitor", async () => {
    const { report, resident } = await submittedReport();
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });

    signInAs(resident);
    const a = await run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED")));
    expect(a.result.error).toMatch(/permission/i);

    signInAs(complaints);
    const b = await run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED")));
    expect(b.result.error).toMatch(/permission/i);

    signOut();
    const c = await run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED")));
    expect(c.result.error).toMatch(/permission/i);

    expect(await statusOf(report)).toBe("SUBMITTED");
  });

  it("cannot reject a report that is already verified", async () => {
    const { report } = await submittedReport();
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);
    await run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED")));
    const out = await run(() =>
      reviewReportAction(null, reviewForm(report.reportId, "REJECTED", "Changed my mind about this"))
    );
    expect(out.result.error).toMatch(/cannot be moved/i);
    expect(await statusOf(report)).toBe("VERIFIED");
  });

  it("lets only one decision win when verify and reject arrive at the same time", async () => {
    const { report } = await submittedReport();
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);
    const results = await Promise.all([
      run(() => reviewReportAction(null, reviewForm(report.reportId, "VERIFIED"))),
      run(() => reviewReportAction(null, reviewForm(report.reportId, "REJECTED", "Rejected at the same moment"))),
    ]);
    const wins = results.filter((r) => r.result && r.result.success);
    expect(wins).toHaveLength(1);
    const saved = await WasteReport.findById(report._id).lean();
    expect(["VERIFIED", "REJECTED"]).toContain(saved.status);
    expect(saved.statusHistory).toHaveLength(1);
  });
});

async function verifiedReport(zone) {
  const resident = await makeUser();
  const report = await makeReport(resident._id, newId(), "VERIFIED");
  await WasteReport.updateOne({ _id: report._id }, { $set: { serviceZone: zone._id } });
  return report;
}

function assignForm(reportId, collectorId, reason) {
  return form({ reportId: reportId, collectorId: String(collectorId), reason: reason });
}

describe("assignCollectorAction", () => {
  it("assigns a collector from the same zone", async () => {
    const zone = await makeZone("Zone A");
    const report = await verifiedReport(zone);
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    const out = await run(() => assignCollectorAction(null, assignForm(report.reportId, collector._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await WasteReport.findById(report._id).lean();
    expect(saved.status).toBe("ASSIGNED");
    expect(String(saved.assignedCollector)).toBe(String(collector._id));
  });

  it("refuses a collector from another zone", async () => {
    const zoneA = await makeZone("Zone A");
    const zoneB = await makeZone("Zone B");
    const report = await verifiedReport(zoneA);
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zoneB._id });
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    const out = await run(() => assignCollectorAction(null, assignForm(report.reportId, collector._id)));
    expect(out.result.error).toMatch(/service zone/i);
    expect(await statusOf(report)).toBe("VERIFIED");
  });

  it("refuses a suspended collector", async () => {
    const zone = await makeZone("Zone A");
    const report = await verifiedReport(zone);
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id, status: "SUSPENDED" });
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    const out = await run(() => assignCollectorAction(null, assignForm(report.reportId, collector._id)));
    expect(out.result.error).toMatch(/not available/i);
    expect(await statusOf(report)).toBe("VERIFIED");
  });

  it("does not assign a report that is not verified yet", async () => {
    const zone = await makeZone("Zone A");
    const resident = await makeUser();
    const report = await makeReport(resident._id, newId(), "SUBMITTED");
    await WasteReport.updateOne({ _id: report._id }, { $set: { serviceZone: zone._id } });
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    const out = await run(() => assignCollectorAction(null, assignForm(report.reportId, collector._id)));
    expect(out.result.error).toMatch(/cannot be assigned/i);
    expect(await statusOf(report)).toBe("SUBMITTED");
  });

  it("needs a reason to reassign, and then reassigns", async () => {
    const zone = await makeZone("Zone A");
    const report = await verifiedReport(zone);
    const first = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const second = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const staff = await makeUser({ role: "OPERATIONS_MANAGER" });
    signInAs(staff);

    await run(() => assignCollectorAction(null, assignForm(report.reportId, first._id)));

    const same = await run(() => assignCollectorAction(null, assignForm(report.reportId, first._id)));
    expect(same.result.error).toMatch(/already assigned/i);

    const noReason = await run(() => assignCollectorAction(null, assignForm(report.reportId, second._id)));
    expect(noReason.result.error).toMatch(/reassign/i);

    const ok = await run(() =>
      assignCollectorAction(null, assignForm(report.reportId, second._id, "First collector is on leave"))
    );
    expect(ok.result.success).toBeTruthy();
    const saved = await WasteReport.findById(report._id).lean();
    expect(String(saved.assignedCollector)).toBe(String(second._id));
  });

  it("refuses a complaints manager", async () => {
    const zone = await makeZone("Zone A");
    const report = await verifiedReport(zone);
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const wrong = await makeUser({ role: "COMPLAINTS_MANAGER" });
    signInAs(wrong);

    const out = await run(() => assignCollectorAction(null, assignForm(report.reportId, collector._id)));
    expect(out.result.error).toMatch(/permission/i);
    expect(await statusOf(report)).toBe("VERIFIED");
  });
});

async function assignedJob(collector, status) {
  const resident = await makeUser();
  const report = await makeReport(resident._id, newId(), status || "ASSIGNED");
  await WasteReport.updateOne({ _id: report._id }, { $set: { assignedCollector: collector._id } });
  return report;
}

function jobForm(reportId, step, note) {
  return form({ reportId: reportId, step: step, note: note });
}

describe("updateJobAction", () => {
  it("walks a job from Accepted to Collected, one step at a time", async () => {
    const collector = await makeUser({ role: "COLLECTOR" });
    const report = await assignedJob(collector);
    signInAs(collector);

    for (const step of ["ACCEPTED", "ON_THE_WAY", "ARRIVED"]) {
      const out = await run(() => updateJobAction(null, jobForm(report.reportId, step)));
      expect(out.result.success).toBeTruthy();
    }
    const done = await run(() =>
      updateJobAction(null, jobForm(report.reportId, "COLLECTED", "Collected and bags were sorted correctly"))
    );
    expect(done.result.success).toBeTruthy();

    const saved = await WasteReport.findById(report._id).lean();
    expect(saved.status).toBe("COLLECTED");
    expect(saved.statusHistory.map((h) => h.status)).toEqual(["ACCEPTED", "ON_THE_WAY", "ARRIVED", "COLLECTED"]);

    const after = await run(() =>
      updateJobAction(null, jobForm(report.reportId, "UNABLE_TO_COLLECT", "Trying to change a finished job"))
    );
    expect(after.result.error).toMatch(/cannot be moved/i);
    expect(await statusOf(report)).toBe("COLLECTED");
  });

  it("does not let a collector skip steps", async () => {
    const collector = await makeUser({ role: "COLLECTOR" });
    const report = await assignedJob(collector);
    signInAs(collector);

    const arrived = await run(() => updateJobAction(null, jobForm(report.reportId, "ARRIVED")));
    expect(arrived.result.error).toMatch(/cannot be moved/i);
    const collected = await run(() =>
      updateJobAction(null, jobForm(report.reportId, "COLLECTED", "Trying to skip straight to collected"))
    );
    expect(collected.result.error).toMatch(/cannot be moved/i);
    expect(await statusOf(report)).toBe("ASSIGNED");
  });

  it("requires a note for Collected and for Unable to Collect", async () => {
    const collector = await makeUser({ role: "COLLECTOR" });
    const report = await assignedJob(collector, "ARRIVED");
    signInAs(collector);

    const a = await run(() => updateJobAction(null, jobForm(report.reportId, "COLLECTED")));
    expect(a.result.error).toMatch(/note/i);
    const b = await run(() => updateJobAction(null, jobForm(report.reportId, "UNABLE_TO_COLLECT", "short")));
    expect(b.result.error).toMatch(/note/i);
    expect(await statusOf(report)).toBe("ARRIVED");

    const c = await run(() =>
      updateJobAction(null, jobForm(report.reportId, "UNABLE_TO_COLLECT", "The road to the house was blocked"))
    );
    expect(c.result.success).toBeTruthy();
    expect(await statusOf(report)).toBe("UNABLE_TO_COLLECT");
  });

  it("does not let a collector touch a job assigned to someone else", async () => {
    const owner = await makeUser({ role: "COLLECTOR" });
    const other = await makeUser({ role: "COLLECTOR" });
    const report = await assignedJob(owner);
    signInAs(other);

    const out = await run(() => updateJobAction(null, jobForm(report.reportId, "ACCEPTED")));
    expect(out.result.error).toMatch(/cannot be moved/i);
    expect(await statusOf(report)).toBe("ASSIGNED");
  });

  it("refuses residents and staff accounts", async () => {
    const owner = await makeUser({ role: "COLLECTOR" });
    const report = await assignedJob(owner);
    const resident = await makeUser();
    const admin = await makeUser({ role: "SUPER_ADMIN" });

    signInAs(resident);
    const a = await run(() => updateJobAction(null, jobForm(report.reportId, "ACCEPTED")));
    expect(a.result.error).toMatch(/permission/i);

    signInAs(admin);
    const b = await run(() => updateJobAction(null, jobForm(report.reportId, "ACCEPTED")));
    expect(b.result.error).toMatch(/permission/i);

    expect(await statusOf(report)).toBe("ASSIGNED");
  });
});
`);

write("tests/integration/complaints.test.js", `
import { randomUUID } from "node:crypto";
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
import {
  createComplaintAction,
  replyComplaintAction,
  reopenComplaintAction,
} from "@/actions/complaints";
import {
  updateComplaintStatusAction,
  assignComplaintAction,
} from "@/actions/adminComplaints";
import Complaint from "@/models/Complaint";
import ComplaintMessage from "@/models/ComplaintMessage";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

let seq = 0;
async function makeComplaint(resident, overrides) {
  seq += 1;
  return Complaint.create(
    Object.assign(
      {
        ticketNumber: "ECC-20261101-" + seq.toString(16).toUpperCase().padStart(8, "0"),
        reporter: resident._id,
        category: "OTHER",
        description: "Test complaint description",
        status: "SUBMITTED",
        statusHistory: [{ status: "SUBMITTED", note: "Complaint submitted by resident" }],
      },
      overrides || {}
    )
  );
}

function newForm(overrides) {
  return form(
    Object.assign(
      {
        category: "MISSED_COLLECTION",
        description: "The bins on my street were not emptied",
        idempotencyKey: randomUUID(),
      },
      overrides || {}
    )
  );
}

async function fresh(complaint) {
  return Complaint.findById(complaint._id).lean();
}

describe("createComplaintAction", () => {
  it("creates a ticket and marks hazardous-waste complaints as high priority", async () => {
    const resident = await makeUser();
    signInAs(resident);

    const normal = await run(() => createComplaintAction(null, newForm()));
    expect(normal.redirect.startsWith("/dashboard/complaints/ECC-")).toBe(true);
    const hazard = await run(() => createComplaintAction(null, newForm({ category: "HAZARDOUS_WASTE" })));
    expect(hazard.redirect.startsWith("/dashboard/complaints/ECC-")).toBe(true);

    const saved = await Complaint.find({ reporter: resident._id }).sort({ _id: 1 }).lean();
    expect(saved).toHaveLength(2);
    expect(saved[0].priority).toBe("NORMAL");
    expect(saved[1].priority).toBe("HIGH");
    expect(saved[0].status).toBe("SUBMITTED");
  });

  it("refuses a visitor who is not logged in, and staff accounts", async () => {
    const out = await run(() => createComplaintAction(null, newForm()));
    expect(out.result.error).toMatch(/log in/i);

    const admin = await makeUser({ role: "SUPER_ADMIN" });
    signInAs(admin);
    const staff = await run(() => createComplaintAction(null, newForm()));
    expect(staff.result.error).toMatch(/resident/i);
    expect(await Complaint.countDocuments({})).toBe(0);
  });

  it("creates one ticket when the same form key is sent many times at once", async () => {
    const resident = await makeUser();
    signInAs(resident);
    const key = randomUUID();
    await Promise.all(
      Array.from({ length: 5 }, () => run(() => createComplaintAction(null, newForm({ idempotencyKey: key }))))
    );
    expect(await Complaint.countDocuments({ reporter: resident._id })).toBe(1);
  });

  it("limits a resident to five complaints per hour", async () => {
    const resident = await makeUser();
    signInAs(resident);
    const outcomes = [];
    for (let i = 0; i < 6; i++) {
      outcomes.push(await run(() => createComplaintAction(null, newForm())));
    }
    expect(outcomes.slice(0, 5).every((o) => typeof o.redirect === "string")).toBe(true);
    expect(outcomes[5].result.error).toMatch(/too many/i);
    expect(await Complaint.countDocuments({})).toBe(5);
  });
});

describe("replyComplaintAction", () => {
  it("lets a resident reply to their own open complaint", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    signInAs(resident);
    const out = await run(() =>
      replyComplaintAction(null, form({ ticketNumber: complaint.ticketNumber, body: "Here is more information" }))
    );
    expect(out.result.success).toBeTruthy();
    const messages = await ComplaintMessage.find({ complaint: complaint._id }).lean();
    expect(messages).toHaveLength(1);
    expect(messages[0].visibility).toBe("PUBLIC");
  });

  it("does not let another resident reply", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const complaint = await makeComplaint(owner);
    signInAs(other);
    const out = await run(() =>
      replyComplaintAction(null, form({ ticketNumber: complaint.ticketNumber, body: "I am not the owner" }))
    );
    expect(out.result.error).toMatch(/your own open/i);
    expect(await ComplaintMessage.countDocuments({})).toBe(0);
  });

  it("does not allow a reply on a resolved complaint", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "RESOLVED", resolvedAt: new Date() });
    signInAs(resident);
    const out = await run(() =>
      replyComplaintAction(null, form({ ticketNumber: complaint.ticketNumber, body: "One more thing" }))
    );
    expect(out.result.error).toMatch(/your own open/i);
  });
});

describe("updateComplaintStatusAction", () => {
  function statusForm(ticket, decision, reason) {
    return form({ ticketNumber: ticket, decision: decision, reason: reason });
  }

  it("needs a reason to resolve, then records the resolution", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "UNDER_REVIEW" });
    const agent = await makeUser({ role: "SUPPORT_AGENT" });
    signInAs(agent);

    const none = await run(() => updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED")));
    expect(none.result.error).toMatch(/at least 10/);
    expect((await fresh(complaint)).status).toBe("UNDER_REVIEW");

    const ok = await run(() =>
      updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED", "The bins were emptied today"))
    );
    expect(ok.result.success).toBeTruthy();
    const saved = await fresh(complaint);
    expect(saved.status).toBe("RESOLVED");
    expect(saved.resolutionSummary).toBe("The bins were emptied today");
    expect(saved.resolvedAt).toBeTruthy();
  });

  it("cannot resolve a complaint that was never reviewed", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    const agent = await makeUser({ role: "SUPPORT_AGENT" });
    signInAs(agent);
    const out = await run(() =>
      updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED", "Trying to skip the review"))
    );
    expect(out.result.error).toMatch(/cannot be moved/i);
    expect((await fresh(complaint)).status).toBe("SUBMITTED");
  });

  it("keeps the escalation reason out of the status history", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "UNDER_REVIEW" });
    const manager = await makeUser({ role: "COMPLAINTS_MANAGER" });
    signInAs(manager);

    const out = await run(() =>
      updateComplaintStatusAction(
        null,
        statusForm(complaint.ticketNumber, "ESCALATED", "Needs senior review because of repeated misses")
      )
    );
    expect(out.result.success).toBeTruthy();

    const saved = await fresh(complaint);
    expect(saved.status).toBe("ESCALATED");
    const last = saved.statusHistory[saved.statusHistory.length - 1];
    expect(last.note).toBe("Escalated for senior review");
    expect(JSON.stringify(saved.statusHistory).includes("repeated misses")).toBe(false);

    const internal = await ComplaintMessage.find({ complaint: complaint._id, visibility: "INTERNAL" }).lean();
    expect(internal).toHaveLength(1);
    expect(internal[0].body.includes("repeated misses")).toBe(true);
  });

  it("refuses a resident, a read-only analyst and a visitor", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "UNDER_REVIEW" });
    const analyst = await makeUser({ role: "READ_ONLY_ANALYST" });

    signInAs(resident);
    const a = await run(() =>
      updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED", "I resolve my own complaint"))
    );
    expect(a.result.error).toMatch(/permission/i);

    signInAs(analyst);
    const b = await run(() =>
      updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED", "Analysts cannot resolve"))
    );
    expect(b.result.error).toMatch(/permission/i);

    signOut();
    const c = await run(() =>
      updateComplaintStatusAction(null, statusForm(complaint.ticketNumber, "RESOLVED", "Nobody is logged in"))
    );
    expect(c.result.error).toMatch(/permission/i);

    expect((await fresh(complaint)).status).toBe("UNDER_REVIEW");
  });
});

describe("reopenComplaintAction", () => {
  function reopenForm(ticket, reason) {
    return form({ ticketNumber: ticket, reason: reason });
  }

  it("reopens a resolved complaint once", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "RESOLVED", resolvedAt: new Date() });
    signInAs(resident);

    const first = await run(() =>
      reopenComplaintAction(null, reopenForm(complaint.ticketNumber, "The problem came back this morning"))
    );
    expect(first.result.success).toBeTruthy();
    let saved = await fresh(complaint);
    expect(saved.status).toBe("UNDER_REVIEW");
    expect(saved.reopenCount).toBe(1);

    await Complaint.updateOne({ _id: complaint._id }, { $set: { status: "RESOLVED", resolvedAt: new Date() } });
    const second = await run(() =>
      reopenComplaintAction(null, reopenForm(complaint.ticketNumber, "Still not fixed after the second visit"))
    );
    expect(second.result.error).toMatch(/cannot be reopened/i);
    saved = await fresh(complaint);
    expect(saved.status).toBe("RESOLVED");
    expect(saved.reopenCount).toBe(1);
  });

  it("does not reopen after seven days", async () => {
    const resident = await makeUser();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const complaint = await makeComplaint(resident, { status: "RESOLVED", resolvedAt: eightDaysAgo });
    signInAs(resident);
    const out = await run(() =>
      reopenComplaintAction(null, reopenForm(complaint.ticketNumber, "I only noticed this problem now"))
    );
    expect(out.result.error).toMatch(/cannot be reopened/i);
    expect((await fresh(complaint)).status).toBe("RESOLVED");
  });

  it("does not let another resident reopen someone else's complaint", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const complaint = await makeComplaint(owner, { status: "RESOLVED", resolvedAt: new Date() });
    signInAs(other);
    const out = await run(() =>
      reopenComplaintAction(null, reopenForm(complaint.ticketNumber, "This is not even my complaint"))
    );
    expect(out.result.error).toMatch(/cannot be reopened/i);
    expect((await fresh(complaint)).status).toBe("RESOLVED");
  });

  it("does not reopen a complaint that is not resolved", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident, { status: "UNDER_REVIEW" });
    signInAs(resident);
    const out = await run(() =>
      reopenComplaintAction(null, reopenForm(complaint.ticketNumber, "It is still being looked at"))
    );
    expect(out.result.error).toMatch(/cannot be reopened/i);
  });
});

describe("assignComplaintAction", () => {
  function assignForm(ticket, assigneeId, reason) {
    return form({ ticketNumber: ticket, assigneeId: String(assigneeId), reason: reason });
  }

  it("assigns a complaint to a support agent", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    const agent = await makeUser({ role: "SUPPORT_AGENT" });
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    signInAs(admin);

    const out = await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, agent._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await fresh(complaint);
    expect(saved.status).toBe("ASSIGNED");
    expect(String(saved.assignedTo)).toBe(String(agent._id));
  });

  it("does not assign a complaint to a collector or a resident", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    const collector = await makeUser({ role: "COLLECTOR" });
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    signInAs(admin);

    const a = await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, collector._id)));
    expect(a.result.error).toMatch(/not available/i);
    const b = await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, resident._id)));
    expect(b.result.error).toMatch(/not available/i);
    expect((await fresh(complaint)).assignedTo).toBeUndefined();
  });

  it("needs a reason to reassign and keeps that reason internal", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    const first = await makeUser({ role: "SUPPORT_AGENT" });
    const second = await makeUser({ role: "COMPLAINTS_MANAGER" });
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    signInAs(admin);

    await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, first._id)));

    const none = await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, second._id)));
    expect(none.result.error).toMatch(/reassign/i);

    const ok = await run(() =>
      assignComplaintAction(null, assignForm(complaint.ticketNumber, second._id, "First agent is on leave this week"))
    );
    expect(ok.result.success).toBeTruthy();
    expect(String((await fresh(complaint)).assignedTo)).toBe(String(second._id));

    const internal = await ComplaintMessage.find({ complaint: complaint._id, visibility: "INTERNAL" }).lean();
    expect(internal).toHaveLength(1);
  });

  it("refuses a read-only analyst", async () => {
    const resident = await makeUser();
    const complaint = await makeComplaint(resident);
    const agent = await makeUser({ role: "SUPPORT_AGENT" });
    const analyst = await makeUser({ role: "READ_ONLY_ANALYST" });
    signInAs(analyst);
    const out = await run(() => assignComplaintAction(null, assignForm(complaint.ticketNumber, agent._id)));
    expect(out.result.error).toMatch(/permission/i);
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (/mongodb\+srv|\.env\.local/.test(src)) problems.push("must never reference Atlas or .env.local");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.endsWith(".test.js")) {
    if (!src.includes("describe(")) problems.push("no tests found");
    if (!src.includes("vi.mock(")) problems.push("session mock missing");
    if (!src.includes("connectTestDb")) problems.push("local test database setup missing");
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
console.log("\nALL OK: " + written.length + " files written and checked. Now run: npm run test:integration");