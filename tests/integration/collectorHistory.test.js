import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { listCollectorHistory } from "@/services/collectorHistory";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

async function finished(resident, collector, status, extra) {
  const report = await makeReport(resident._id, newId(), status);
  await WasteReport.updateOne(
    { _id: report._id },
    {
      $set: Object.assign(
        {
          assignedCollector: collector._id,
          statusHistory: [
            { status: "ASSIGNED", at: new Date(Date.now() - 5000) },
            { status: status, at: new Date(Date.now() - 1000), note: "Note for " + status },
          ],
        },
        extra || {}
      ),
    }
  );
  return report;
}

describe("listCollectorHistory", () => {
  it("lists only this collector's finished jobs", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    const other = await makeUser({ role: "COLLECTOR" });
    const a = await finished(resident, me, "COLLECTED");
    const b = await finished(resident, me, "UNABLE_TO_COLLECT");
    await finished(resident, other, "COLLECTED");
    await finished(resident, me, "ARRIVED");
    await finished(resident, me, "ASSIGNED");
    const gone = await finished(resident, me, "COLLECTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const result = await listCollectorHistory(String(me._id));
    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.reportId).sort()).toEqual([a.reportId, b.reportId].sort());
  });

  it("shows the zone, the finishing time and the collector's own note", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    const zone = await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    await finished(resident, me, "UNABLE_TO_COLLECT", { serviceZone: zone._id });

    const result = await listCollectorHistory(String(me._id));
    expect(result.items[0].zoneName).toBe("Zone A");
    expect(result.items[0].note).toBe("Note for UNABLE_TO_COLLECT");
    expect(result.items[0].finishedAt).toBeTruthy();
  });

  it("filters by result", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    await finished(resident, me, "COLLECTED");
    await finished(resident, me, "UNABLE_TO_COLLECT");
    const only = await listCollectorHistory(String(me._id), { status: "COLLECTED" });
    expect(only.total).toBe(1);
    expect(only.items[0].status).toBe("COLLECTED");
    const ignored = await listCollectorHistory(String(me._id), { status: "HACKED" });
    expect(ignored.total).toBe(2);
  });

  it("pages the results", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    for (let i = 0; i < 3; i++) await finished(resident, me, "COLLECTED");
    const first = await listCollectorHistory(String(me._id), { page: 1, pageSize: 2 });
    const second = await listCollectorHistory(String(me._id), { page: 2, pageSize: 2 });
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
  });

  it("never returns anything about the resident", async () => {
    const resident = await makeUser();
    const me = await makeUser({ role: "COLLECTOR" });
    await finished(resident, me, "COLLECTED");
    const text = JSON.stringify(await listCollectorHistory(String(me._id)));
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });

  it("returns an empty result when there are no finished jobs", async () => {
    const me = await makeUser({ role: "COLLECTOR" });
    expect(await listCollectorHistory(String(me._id))).toEqual({ items: [], total: 0 });
  });
});
