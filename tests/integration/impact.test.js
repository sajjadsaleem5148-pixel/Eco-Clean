import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { getImpactFigures } from "@/services/impact";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardOrder from "@/models/RewardOrder";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

// Fills every unique field of the model with a different value, so raw inserts cannot clash on null.
function withUniques(Model, rows) {
  const fields = new Set();
  Model.schema.indexes().forEach(function (idx) {
    if (idx[1] && idx[1].unique) Object.keys(idx[0]).forEach(function (k) { fields.add(k); });
  });
  Object.keys(Model.schema.paths).forEach(function (p) {
    const o = Model.schema.paths[p].options;
    if (o && o.unique) fields.add(p);
  });
  fields.delete('_id');
  return rows.map(function (row, i) {
    const copy = Object.assign({}, row);
    fields.forEach(function (f) {
      if (copy[f] === undefined) copy[f] = 'U-' + i + '-' + f;
    });
    return copy;
  });
}

describe("getImpactFigures", () => {
  it("returns zeros on an empty database", async () => {
    expect(await getImpactFigures()).toEqual({
      reportsCollected: 0,
      reportsSubmitted: 0,
      activeZones: 0,
      activeResidents: 0,
      ordersCompleted: 0,
      pointsEarned: 0,
    });
  });

  it("counts collected and submitted reports and ignores deleted ones", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "COLLECTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const gone = await makeReport(resident._id, newId(), "COLLECTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const f = await getImpactFigures();
    expect(f.reportsCollected).toBe(2);
    expect(f.reportsSubmitted).toBe(3);
  });

  it("counts active zones and active residents only", async () => {
    await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    await ServiceZone.create({ name: "Zone B", slug: "zone-b", status: "INACTIVE" });
    await makeUser();
    await makeUser({ status: "SUSPENDED" });
    await makeUser({ role: "COLLECTOR" });
    await makeUser({ role: "SUPER_ADMIN" });

    const f = await getImpactFigures();
    expect(f.activeZones).toBe(1);
    expect(f.activeResidents).toBe(1);
  });

  it("counts completed orders and adds up only earned points", async () => {
    const user = await makeUser();
    await RewardOrder.collection.insertMany([
      { orderNumber: "RO-1", status: "COMPLETED", user: user._id },
      { orderNumber: "RO-2", status: "PENDING", user: user._id },
    ]);
    await GreenPointsTransaction.collection.insertMany(withUniques(GreenPointsTransaction, [
      { transactionId: "T-1", idempotencyKey: "K-1", user: user._id, type: "EARN", points: 10 },
      { transactionId: "T-2", idempotencyKey: "K-2", user: user._id, type: "EARN", points: 15 },
      { transactionId: "T-3", idempotencyKey: "K-3", user: user._id, type: "REDEEM", points: -20 },
      { transactionId: "T-4", idempotencyKey: "K-4", user: user._id, type: "REFUND", points: 20 },
    ]));

    const f = await getImpactFigures();
    expect(f.ordersCompleted).toBe(1);
    expect(f.pointsEarned).toBe(25);
  });

  it("returns only numbers and never a name, email or id", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "COLLECTED");
    const f = await getImpactFigures();
    Object.keys(f).forEach((k) => expect(typeof f[k]).toBe("number"));
    const text = JSON.stringify(f);
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });
});
