import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { getZoneCoverage } from "@/services/zoneCoverage";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import Neighborhood from "@/models/Neighborhood";
import CollectionSchedule from "@/models/CollectionSchedule";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function rowOf(data, name) {
  return data.rows.find((r) => r.name === name);
}

describe("getZoneCoverage", () => {
  it("returns empty results on an empty database", async () => {
    expect(await getZoneCoverage()).toEqual({ rows: [], residentsWithoutZone: 0, totalResidents: 0 });
  });

  it("counts active residents per zone and those without a zone, and skips suspended ones", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await makeUser({ serviceZone: a._id });
    await makeUser({ serviceZone: a._id });
    await makeUser({ serviceZone: b._id });
    await makeUser();
    await makeUser({ serviceZone: a._id, status: "SUSPENDED" });
    await makeUser({ role: "COLLECTOR", serviceZone: a._id });

    const data = await getZoneCoverage();
    expect(rowOf(data, "Zone A").residents).toBe(2);
    expect(rowOf(data, "Zone B").residents).toBe(1);
    expect(data.residentsWithoutZone).toBe(1);
    expect(data.totalResidents).toBe(4);
  });

  it("counts active neighborhoods, active collectors and confirmed schedules only", async () => {
    const a = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: a._id });
    await makeUser({ role: "COLLECTOR", serviceZone: a._id, status: "SUSPENDED" });
    await Neighborhood.create({ serviceZone: a._id, name: "North", nameKey: "north", status: "ACTIVE" });
    await Neighborhood.create({ serviceZone: a._id, name: "South", nameKey: "south", status: "INACTIVE" });
    const base = { serviceZone: a._id, collector: collector._id, weekday: 1, startTime: "08:00", endTime: "10:00" };
    await CollectionSchedule.create(Object.assign({}, base, { status: "CONFIRMED" }));
    await CollectionSchedule.create(Object.assign({}, base, { weekday: 2, status: "DRAFT" }));
    await CollectionSchedule.create(Object.assign({}, base, { weekday: 3, status: "CANCELLED" }));

    const row = rowOf(await getZoneCoverage(), "Zone A");
    expect(row.neighborhoods).toBe(1);
    expect(row.collectors).toBe(1);
    expect(row.schedules).toBe(1);
    expect(row.gaps).toEqual([]);
  });

  it("counts open reports only and not finished ones", async () => {
    const a = await makeZone("Zone A");
    const resident = await makeUser();
    for (const status of ["SUBMITTED", "ASSIGNED", "COLLECTED", "REJECTED"]) {
      const r = await makeReport(resident._id, newId(), status);
      await WasteReport.updateOne({ _id: r._id }, { $set: { serviceZone: a._id } });
    }
    const gone = await makeReport(resident._id, newId(), "SUBMITTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { serviceZone: a._id, deletedAt: new Date() } });

    expect(rowOf(await getZoneCoverage(), "Zone A").openReports).toBe(2);
  });

  it("marks gaps on an active zone and none on an inactive zone", async () => {
    await makeZone("Zone A");
    await makeZone("Zone B", { status: "INACTIVE" });
    const data = await getZoneCoverage();
    expect(rowOf(data, "Zone A").gaps).toEqual(["No active collector", "No confirmed schedule"]);
    expect(rowOf(data, "Zone B").gaps).toEqual([]);
  });

  it("never returns a name, an email or an id of a resident", async () => {
    const a = await makeZone("Zone A");
    const resident = await makeUser({ serviceZone: a._id });
    const text = JSON.stringify(await getZoneCoverage());
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });
});
