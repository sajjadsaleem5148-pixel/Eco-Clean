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
import { createRouteAction, updateRouteAction, setRouteStatusAction } from "@/actions/routes";
import CollectionRoute from "@/models/CollectionRoute";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeRoute(zone, overrides) {
  return CollectionRoute.create(
    Object.assign(
      {
        serviceZone: zone._id,
        name: "North Loop",
        nameKey: "northloop",
        stops: ["Main Street", "Park Road"],
        status: "DRAFT",
      },
      overrides || {}
    )
  );
}

function createForm(zone, overrides) {
  return form(
    Object.assign(
      { zoneId: String(zone._id), name: "North  Loop", collectorId: "", stops: "Main Street\nPark Road\nmain street" },
      overrides || {}
    )
  );
}

describe("createRouteAction", () => {
  it("saves a draft with clean stops, in order, and an audit entry", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await asOperations();
    const out = await run(() => createRouteAction(null, createForm(zone, { collectorId: String(collector._id) })));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionRoute.findOne({}).lean();
    expect(saved.name).toBe("North Loop");
    expect(saved.nameKey).toBe("northloop");
    expect(saved.status).toBe("DRAFT");
    expect(saved.stops).toEqual(["Main Street", "Park Road"]);
    expect(String(saved.collector)).toBe(String(collector._id));
    expect(await AuditLog.countDocuments({ action: "route.create" })).toBe(1);
  });

  it("refuses a collector from another zone, a suspended collector and a bad id", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    const stranger = await makeUser({ role: "COLLECTOR", serviceZone: b._id });
    const suspended = await makeUser({ role: "COLLECTOR", serviceZone: a._id, status: "SUSPENDED" });
    await asOperations();
    const x = await run(() => createRouteAction(null, createForm(a, { collectorId: String(stranger._id) })));
    expect(x.result.error).toMatch(/not assigned to the zone/i);
    const y = await run(() => createRouteAction(null, createForm(a, { collectorId: String(suspended._id) })));
    expect(y.result.error).toMatch(/not available/i);
    const z = await run(() => createRouteAction(null, createForm(a, { collectorId: "nope" })));
    expect(z.result.error).toMatch(/not available/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });

  it("refuses the same name inside one zone but allows it in another zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await asOperations();
    await run(() => createRouteAction(null, createForm(a)));
    for (const name of ["north loop", "NORTH-LOOP.", " North   Loop "]) {
      const out = await run(() => createRouteAction(null, createForm(a, { name: name })));
      expect(out.result.error).toMatch(/already has/i);
    }
    const other = await run(() => createRouteAction(null, createForm(b)));
    expect(other.result.success).toBeTruthy();
    expect(await CollectionRoute.countDocuments({})).toBe(2);
  });

  it("creates only one route when the same name arrives twice at the same time", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const results = await Promise.all([
      run(() => createRouteAction(null, createForm(zone))),
      run(() => createRouteAction(null, createForm(zone, { name: "north-loop" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await CollectionRoute.countDocuments({})).toBe(1);
  });

  it("refuses too many stops, an inactive zone and a symbol-only name", async () => {
    const zone = await makeZone("Zone A");
    const off = await makeZone("Zone B", { status: "INACTIVE" });
    await asOperations();
    const many = Array.from({ length: 41 }, (_, i) => "Stop " + i).join("\n");
    const a = await run(() => createRouteAction(null, createForm(zone, { stops: many })));
    expect(a.result.error).toMatch(/40/);
    const b = await run(() => createRouteAction(null, createForm(off)));
    expect(b.result.error).toMatch(/not available/i);
    const c = await run(() => createRouteAction(null, createForm(zone, { name: "!!!" })));
    expect(c.result.error).toMatch(/letters or numbers/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    const zone = await makeZone("Zone A");
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createRouteAction(null, createForm(zone)));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createRouteAction(null, createForm(zone)));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await CollectionRoute.countDocuments({})).toBe(0);
  });
});

describe("updateRouteAction", () => {
  function updateForm(id, overrides) {
    return form(
      Object.assign({ routeId: String(id), name: "Renamed Loop", collectorId: "", stops: "One\nTwo\nThree" }, overrides || {})
    );
  }

  it("edits a draft but never moves it to another zone", async () => {
    const zone = await makeZone("Zone A");
    const route = await makeRoute(zone);
    await asOperations();
    const out = await run(() => updateRouteAction(null, updateForm(route._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.name).toBe("Renamed Loop");
    expect(saved.nameKey).toBe("renamedloop");
    expect(saved.stops).toEqual(["One", "Two", "Three"]);
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "route.update" })).toBe(1);
  });

  it("clears the collector when none is chosen", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    await run(() => updateRouteAction(null, updateForm(route._id)));
    expect((await CollectionRoute.findById(route._id).lean()).collector).toBeUndefined();
  });

  it("does not edit an inactive route, and keeps an active route valid", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const off = await makeRoute(zone, { name: "Old Loop", nameKey: "oldloop", status: "INACTIVE" });
    const live = await makeRoute(zone, { name: "Live Loop", nameKey: "liveloop", status: "ACTIVE", collector: collector._id });
    await asOperations();

    const a = await run(() => updateRouteAction(null, updateForm(off._id)));
    expect(a.result.error).toMatch(/inactive route cannot be edited/i);
    const b = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: "" })));
    expect(b.result.error).toMatch(/needs a collector/i);
    const c = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: String(collector._id), stops: "Only one" })));
    expect(c.result.error).toMatch(/at least 2/i);
    const d = await run(() => updateRouteAction(null, updateForm(live._id, { collectorId: String(collector._id) })));
    expect(d.result.success).toBeTruthy();
  });

  it("refuses a name used by another route in the same zone, a bad id, an unknown route and a role without permission", async () => {
    const zone = await makeZone("Zone A");
    await makeRoute(zone, { name: "Taken Name", nameKey: "takenname" });
    const route = await makeRoute(zone, { name: "Other Name", nameKey: "othername" });
    await asOperations();
    const a = await run(() => updateRouteAction(null, updateForm(route._id, { name: "taken-name" })));
    expect(a.result.error).toMatch(/already has/i);
    const b = await run(() => updateRouteAction(null, updateForm("nope")));
    expect(b.result.error).toMatch(/invalid/i);
    const c = await run(() => updateRouteAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(c.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const d = await run(() => updateRouteAction(null, updateForm(route._id)));
    expect(d.result.error).toMatch(/permission/i);
  });
});

describe("setRouteStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ routeId: String(id), target: target, reason: reason });
  }

  it("activates a route that has a collector and two stops", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    const out = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(out.result.success).toBeTruthy();
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("ACTIVE");
    expect(await AuditLog.countDocuments({ action: "route.status.active" })).toBe(1);
  });

  it("does not activate without a collector or with fewer than two stops", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const noCollector = await makeRoute(zone);
    const fewStops = await makeRoute(zone, { name: "Short Loop", nameKey: "shortloop", collector: collector._id, stops: ["Only one"] });
    await asOperations();
    const a = await run(() => setRouteStatusAction(null, statusForm(noCollector._id, "ACTIVE")));
    expect(a.result.error).toMatch(/choose a collector/i);
    const b = await run(() => setRouteStatusAction(null, statusForm(fewStops._id, "ACTIVE")));
    expect(b.result.error).toMatch(/at least 2 stops/i);
    expect((await CollectionRoute.findById(noCollector._id).lean()).status).toBe("DRAFT");
    expect((await CollectionRoute.findById(fewStops._id).lean()).status).toBe("DRAFT");
  });

  it("does not activate when the collector or the zone is no longer available", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();

    await User.updateOne({ _id: collector._id }, { $set: { status: "SUSPENDED" } });
    const a = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(a.result.error).toMatch(/no longer available/i);

    await User.updateOne({ _id: collector._id }, { $set: { status: "ACTIVE" } });
    await ServiceZone.updateOne({ _id: zone._id }, { $set: { status: "INACTIVE" } });
    const b = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(b.result.error).toMatch(/zone of this route is not active/i);
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("DRAFT");
  });

  it("needs a real reason to deactivate, then lets the route be reactivated", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id, status: "ACTIVE" });
    await asOperations();

    const none = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);

    const ok = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "Merged into the east route")));
    expect(ok.result.success).toBeTruthy();
    let saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Merged into the east route");

    const back = await run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await CollectionRoute.findById(route._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
  });

  it("lets only one request win when two activations arrive at the same time", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const route = await makeRoute(zone, { collector: collector._id });
    await asOperations();
    const results = await Promise.all([
      run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE"))),
      run(() => setRouteStatusAction(null, statusForm(route._id, "ACTIVE"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "route.status.active" })).toBe(1);
  });

  it("never moves a route back to draft, and refuses roles without permission", async () => {
    const zone = await makeZone("Zone A");
    const route = await makeRoute(zone);
    await asOperations();
    const draft = await run(() => setRouteStatusAction(null, statusForm(route._id, "DRAFT")));
    expect(draft.result.error).toMatch(/cannot be moved/i);

    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "I should not be allowed to")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setRouteStatusAction(null, statusForm(route._id, "INACTIVE", "Nobody is logged in here")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await CollectionRoute.findById(route._id).lean()).status).toBe("DRAFT");
  });
});
