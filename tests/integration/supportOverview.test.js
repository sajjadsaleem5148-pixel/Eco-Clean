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
