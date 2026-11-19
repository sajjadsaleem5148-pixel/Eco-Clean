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
import { createVehicleAction, updateVehicleAction, setVehicleStatusAction } from "@/actions/vehicles";
import Vehicle from "@/models/Vehicle";
import ServiceZone from "@/models/ServiceZone";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function vehicleForm(overrides) {
  return form(
    Object.assign({ plate: "abc  123", type: "TRUCK", capacityKg: "2000", serviceZone: "", notes: "" }, overrides || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function makeVehicle(overrides) {
  return Vehicle.create(
    Object.assign({ plate: "XYZ 999", plateKey: "XYZ999", type: "VAN", capacityKg: 500 }, overrides || {})
  );
}

describe("createVehicleAction", () => {
  it("adds a vehicle with a normalised plate and an audit entry", async () => {
    await asOperations();
    const out = await run(() => createVehicleAction(null, vehicleForm()));
    expect(out.result.success).toBeTruthy();
    const saved = await Vehicle.findOne({}).lean();
    expect(saved.plate).toBe("ABC 123");
    expect(saved.plateKey).toBe("ABC123");
    expect(saved.status).toBe("ACTIVE");
    expect(saved.capacityKg).toBe(2000);
    expect(await AuditLog.countDocuments({ action: "vehicle.create" })).toBe(1);
  });

  it("refuses the same plate written in another way", async () => {
    await asOperations();
    await run(() => createVehicleAction(null, vehicleForm()));
    for (const plate of ["ABC-123", "abc123", " ABC 123 "]) {
      const out = await run(() => createVehicleAction(null, vehicleForm({ plate: plate })));
      expect(out.result.error).toMatch(/already exists/i);
    }
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("creates only one vehicle when the same plate arrives twice at the same time", async () => {
    await asOperations();
    const results = await Promise.all([
      run(() => createVehicleAction(null, vehicleForm())),
      run(() => createVehicleAction(null, vehicleForm({ plate: "ABC-123" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("refuses a bad plate, a bad capacity and an unknown type", async () => {
    await asOperations();
    const a = await run(() => createVehicleAction(null, vehicleForm({ plate: "A;B" })));
    expect(a.result.error).toMatch(/plate/i);
    const b = await run(() => createVehicleAction(null, vehicleForm({ capacityKg: "0" })));
    expect(b.result.error).toMatch(/at least 1/i);
    const c = await run(() => createVehicleAction(null, vehicleForm({ capacityKg: "50001" })));
    expect(c.result.error).toMatch(/too large/i);
    const d = await run(() => createVehicleAction(null, vehicleForm({ type: "SPACESHIP" })));
    expect(d.result.error).toMatch(/type/i);
    expect(await Vehicle.countDocuments({})).toBe(0);
  });

  it("accepts an active zone and refuses an inactive one", async () => {
    const good = await makeZone("Zone A");
    const bad = await makeZone("Zone B", { status: "INACTIVE" });
    await asOperations();
    const ok = await run(() => createVehicleAction(null, vehicleForm({ serviceZone: String(good._id) })));
    expect(ok.result.success).toBeTruthy();
    const no = await run(() => createVehicleAction(null, vehicleForm({ plate: "DEF 456", serviceZone: String(bad._id) })));
    expect(no.result.error).toMatch(/not available/i);
    expect(await Vehicle.countDocuments({})).toBe(1);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createVehicleAction(null, vehicleForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createVehicleAction(null, vehicleForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Vehicle.countDocuments({})).toBe(0);
  });
});

describe("updateVehicleAction", () => {
  function updateForm(id, overrides) {
    return form(Object.assign({ vehicleId: String(id), type: "PICKUP", capacityKg: "800", serviceZone: "", notes: "Old but reliable" }, overrides || {}));
  }

  it("changes the details but never the plate, and can clear the zone", async () => {
    const zone = await makeZone("Zone A");
    const v = await makeVehicle({ serviceZone: zone._id });
    await asOperations();
    const out = await run(() => updateVehicleAction(null, updateForm(v._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Vehicle.findById(v._id).lean();
    expect(saved.type).toBe("PICKUP");
    expect(saved.capacityKg).toBe(800);
    expect(saved.notes).toBe("Old but reliable");
    expect(saved.serviceZone).toBeUndefined();
    expect(saved.plate).toBe("XYZ 999");
    expect(await AuditLog.countDocuments({ action: "vehicle.update" })).toBe(1);
  });

  it("does not edit a retired vehicle, a missing vehicle or with a bad id", async () => {
    const retired = await makeVehicle({ status: "RETIRED" });
    await asOperations();
    const a = await run(() => updateVehicleAction(null, updateForm(retired._id)));
    expect(a.result.error).toMatch(/retired/i);
    const b = await run(() => updateVehicleAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);
    const c = await run(() => updateVehicleAction(null, updateForm("nope")));
    expect(c.result.error).toMatch(/invalid/i);
    expect((await Vehicle.findById(retired._id).lean()).type).toBe("VAN");
  });

  it("refuses a content manager", async () => {
    const v = await makeVehicle();
    const user = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(user);
    const out = await run(() => updateVehicleAction(null, updateForm(v._id)));
    expect(out.result.error).toMatch(/permission/i);
  });
});

describe("setVehicleStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ vehicleId: String(id), target: target, reason: reason });
  }

  it("needs a real reason for maintenance, then returns the vehicle to service", async () => {
    const v = await makeVehicle();
    await asOperations();

    const none = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Engine service this week")));
    expect(ok.result.success).toBeTruthy();
    let saved = await Vehicle.findById(v._id).lean();
    expect(saved.status).toBe("MAINTENANCE");
    expect(saved.statusReason).toBe("Engine service this week");

    const again = await run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Trying the same thing twice")));
    expect(again.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setVehicleStatusAction(null, statusForm(v._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await Vehicle.findById(v._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
  });

  it("never lets a retired vehicle come back", async () => {
    const v = await makeVehicle();
    await asOperations();
    const retire = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "Sold after the accident")));
    expect(retire.result.success).toBeTruthy();
    for (const target of ["ACTIVE", "MAINTENANCE"]) {
      const out = await run(() => setVehicleStatusAction(null, statusForm(v._id, target, "Trying to bring it back")));
      expect(out.result.error).toMatch(/cannot be moved/i);
    }
    expect((await Vehicle.findById(v._id).lean()).status).toBe("RETIRED");
    expect(await AuditLog.countDocuments({ action: "vehicle.status.retired" })).toBe(1);
  });

  it("lets only one request win when two arrive at the same time", async () => {
    const v = await makeVehicle();
    await asOperations();
    const results = await Promise.all([
      run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "First request at the same time"))),
      run(() => setVehicleStatusAction(null, statusForm(v._id, "MAINTENANCE", "Second request at the same time"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "vehicle.status.maintenance" })).toBe(1);
  });

  it("refuses a resident, a content manager and a visitor", async () => {
    const v = await makeVehicle();
    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "I should not be allowed to")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setVehicleStatusAction(null, statusForm(v._id, "RETIRED", "Nobody is logged in here")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Vehicle.findById(v._id).lean()).status).toBe("ACTIVE");
  });
});
