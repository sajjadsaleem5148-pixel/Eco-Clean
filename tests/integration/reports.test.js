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
