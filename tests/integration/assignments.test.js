import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listActiveAssignments } from "@/services/assignments";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

const HOUR = 60 * 60 * 1000;

async function job(resident, collector, status, hoursAgo, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        { assignedCollector: collector._id, assignedAt: new Date(Date.now() - hoursAgo * HOUR) },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listActiveAssignments", () => {
  it("lists only active jobs that have a collector", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const a = await job(resident, collector, "ASSIGNED", 5);
    const b = await job(resident, collector, "ARRIVED", 2);
    await job(resident, collector, "COLLECTED", 9);
    await job(resident, collector, "UNABLE_TO_COLLECT", 9);
    await makeReport(resident._id, newId(), "VERIFIED");
    const gone = await job(resident, collector, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const result = await listActiveAssignments();
    expect(result.items.map((i) => i.reportId).sort()).toEqual([a.reportId, b.reportId].sort());
  });

  it("puts the longest wait first and reports the hours", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const recent = await job(resident, collector, "ASSIGNED", 1);
    const old = await job(resident, collector, "ASSIGNED", 30);
    const result = await listActiveAssignments();
    expect(result.items.map((i) => i.reportId)).toEqual([old.reportId, recent.reportId]);
    expect(result.items[0].hoursWaiting).toBeGreaterThanOrEqual(29);
    expect(result.items[0].hoursWaiting).toBeLessThanOrEqual(31);
  });

  it("summarises per collector and can filter the list without changing the summary", async () => {
    const resident = await makeUser();
    const ali = await makeUser({ role: "COLLECTOR", name: "Ali Collector" });
    const bilal = await makeUser({ role: "COLLECTOR", name: "Bilal Collector" });
    await job(resident, ali, "ASSIGNED", 3);
    await job(resident, ali, "ACCEPTED", 3);
    await job(resident, bilal, "ON_THE_WAY", 3);

    const all = await listActiveAssignments();
    expect(all.summary.map((s) => s.name)).toEqual(["Ali Collector", "Bilal Collector"]);
    expect(all.summary[0].total).toBe(2);

    const only = await listActiveAssignments({ collectorId: String(bilal._id) });
    expect(only.items).toHaveLength(1);
    expect(only.items[0].collectorName).toBe("Bilal Collector");
    expect(only.summary).toHaveLength(2);
  });

  it("counts verified reports that still wait for a collector", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "VERIFIED");
    await makeReport(resident._id, newId(), "VERIFIED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const result = await listActiveAssignments();
    expect(result.waitingForCollector).toBe(2);
    expect(result.items).toEqual([]);
  });

  it("shows the zone name and copes with a missing assignment time", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const zone = await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    const r = await job(resident, collector, "ASSIGNED", 4, { serviceZone: zone._id });
    await WasteReport.updateOne({ _id: r._id }, { $unset: { assignedAt: "" } });

    const result = await listActiveAssignments();
    expect(result.items[0].zoneName).toBe("Zone A");
    expect(result.items[0].assignedAt).toBeNull();
    expect(result.items[0].hoursWaiting).toBeNull();
  });

  it("never returns anything about the resident", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    await job(resident, collector, "ASSIGNED", 2);
    const text = JSON.stringify(await listActiveAssignments());
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });

  it("returns empty results on an empty database", async () => {
    expect(await listActiveAssignments()).toEqual({ items: [], summary: [], waitingForCollector: 0 });
  });
});
