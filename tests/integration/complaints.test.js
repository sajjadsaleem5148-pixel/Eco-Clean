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
