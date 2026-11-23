import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listOverdue, listUnable } from "@/services/overdue";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

const DAY = 24 * 60 * 60 * 1000;

function makeZone(name, days) {
  return ServiceZone.create({
    name: name,
    slug: name.toLowerCase().replace(/ /g, "-"),
    targetCollectionEveryDays: days,
  });
}

async function verifiedReport(resident, zone, status, daysAgo, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        {
          serviceZone: zone._id,
          statusHistory: [
            { status: "SUBMITTED", at: new Date(Date.now() - (daysAgo + 1) * DAY) },
            { status: "VERIFIED", at: new Date(Date.now() - daysAgo * DAY) },
          ],
        },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listOverdue", () => {
  it("lists only open verified reports that passed the zone target", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const late = await verifiedReport(resident, zone, "ASSIGNED", 4);
    await verifiedReport(resident, zone, "VERIFIED", 2);
    await verifiedReport(resident, zone, "COLLECTED", 10);
    await verifiedReport(resident, zone, "REJECTED", 10);

    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([late.reportId]);
    expect(items[0].hoursLate).toBeGreaterThanOrEqual(23);
    expect(items[0].hoursLate).toBeLessThanOrEqual(25);
    expect(items[0].zoneName).toBe("Zone A");
  });

  it("uses each zone's own target", async () => {
    const resident = await makeUser();
    const fast = await makeZone("Fast Zone", 1);
    const slow = await makeZone("Slow Zone", 7);
    const a = await verifiedReport(resident, fast, "VERIFIED", 2);
    await verifiedReport(resident, slow, "VERIFIED", 2);
    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([a.reportId]);
  });

  it("puts the most late report first", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const a = await verifiedReport(resident, zone, "VERIFIED", 5);
    const b = await verifiedReport(resident, zone, "VERIFIED", 9);
    const items = await listOverdue();
    expect(items.map((i) => i.reportId)).toEqual([b.reportId, a.reportId]);
  });

  it("ignores reports without a verification entry and deleted reports", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const none = await verifiedReport(resident, zone, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: none._id }, { $set: { statusHistory: [] } });
    const gone = await verifiedReport(resident, zone, "ASSIGNED", 9);
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });
    expect(await listOverdue()).toEqual([]);
  });

  it("shows the collector's name but nothing about the resident", async () => {
    const resident = await makeUser();
    const collector = await makeUser({ role: "COLLECTOR" });
    const zone = await makeZone("Zone A", 3);
    await verifiedReport(resident, zone, "ASSIGNED", 6, { assignedCollector: collector._id });

    const items = await listOverdue();
    expect(items).toHaveLength(1);
    expect(items[0].collectorName).toBe(collector.name);
    const text = JSON.stringify(items);
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });
});

describe("listUnable", () => {
  it("lists only unable-to-collect reports with the collector's note", async () => {
    const resident = await makeUser();
    const zone = await makeZone("Zone A", 3);
    const unable = await verifiedReport(resident, zone, "UNABLE_TO_COLLECT", 2);
    await WasteReport.updateOne(
      { _id: unable._id },
      {
        $push: {
          statusHistory: { status: "UNABLE_TO_COLLECT", at: new Date(), note: "The road was blocked" },
        },
      }
    );
    await verifiedReport(resident, zone, "COLLECTED", 2);

    const items = await listUnable();
    expect(items).toHaveLength(1);
    expect(items[0].reportId).toBe(unable.reportId);
    expect(items[0].note).toBe("The road was blocked");
    expect(items[0].zoneName).toBe("Zone A");
  });

  it("returns an empty list when nothing was recorded", async () => {
    expect(await listUnable()).toEqual([]);
  });
});
