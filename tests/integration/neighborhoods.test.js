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
  createNeighborhoodAction,
  updateNeighborhoodAction,
  setNeighborhoodStatusAction,
} from "@/actions/neighborhoods";
import Neighborhood from "@/models/Neighborhood";
import ServiceZone from "@/models/ServiceZone";
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

function makeNeighborhood(zone, name, extra) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Neighborhood.create(
    Object.assign({ serviceZone: zone._id, name: name, nameKey: key, status: "ACTIVE" }, extra || {})
  );
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function createForm(zone, overrides) {
  return form(Object.assign({ zoneId: String(zone._id), name: "North  Block", description: "Near the market" }, overrides || {}));
}

describe("createNeighborhoodAction", () => {
  it("adds a neighborhood with a clean name and an audit entry", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const out = await run(() => createNeighborhoodAction(null, createForm(zone)));
    expect(out.result.success).toBeTruthy();
    const saved = await Neighborhood.findOne({}).lean();
    expect(saved.name).toBe("North Block");
    expect(saved.nameKey).toBe("northblock");
    expect(saved.status).toBe("ACTIVE");
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "neighborhood.create" })).toBe(1);
  });

  it("refuses the same name written in another way inside one zone", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    await run(() => createNeighborhoodAction(null, createForm(zone)));
    for (const name of ["north block", "NORTH-BLOCK.", " North   Block "]) {
      const out = await run(() => createNeighborhoodAction(null, createForm(zone, { name: name })));
      expect(out.result.error).toMatch(/already has/i);
    }
    expect(await Neighborhood.countDocuments({})).toBe(1);
  });

  it("allows the same name in a different zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await asOperations();
    const first = await run(() => createNeighborhoodAction(null, createForm(a)));
    const second = await run(() => createNeighborhoodAction(null, createForm(b)));
    expect(first.result.success).toBeTruthy();
    expect(second.result.success).toBeTruthy();
    expect(await Neighborhood.countDocuments({})).toBe(2);
  });

  it("creates only one neighborhood when the same name arrives twice at the same time", async () => {
    const zone = await makeZone("Zone A");
    await asOperations();
    const results = await Promise.all([
      run(() => createNeighborhoodAction(null, createForm(zone))),
      run(() => createNeighborhoodAction(null, createForm(zone, { name: "north-block" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Neighborhood.countDocuments({})).toBe(1);
  });

  it("refuses an inactive zone, an unknown zone, a bad id and a symbol-only name", async () => {
    const inactive = await makeZone("Zone B", { status: "INACTIVE" });
    const zone = await makeZone("Zone A");
    await asOperations();
    const a = await run(() => createNeighborhoodAction(null, createForm(inactive)));
    expect(a.result.error).toMatch(/not available/i);
    const b = await run(() => createNeighborhoodAction(null, createForm({ _id: "507f1f77bcf86cd799439011" })));
    expect(b.result.error).toMatch(/not available/i);
    const c = await run(() => createNeighborhoodAction(null, createForm({ _id: "nope" })));
    expect(c.result.error).toMatch(/invalid/i);
    const d = await run(() => createNeighborhoodAction(null, createForm(zone, { name: "!!!" })));
    expect(d.result.error).toMatch(/letters or numbers/i);
    expect(await Neighborhood.countDocuments({})).toBe(0);
  });

  it("refuses roles without collections.manage, and visitors", async () => {
    const zone = await makeZone("Zone A");
    for (const role of ["CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createNeighborhoodAction(null, createForm(zone)));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createNeighborhoodAction(null, createForm(zone)));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Neighborhood.countDocuments({})).toBe(0);
  });
});

describe("updateNeighborhoodAction", () => {
  function updateForm(id, overrides) {
    return form(Object.assign({ neighborhoodId: String(id), name: "Renamed Block", description: "New text" }, overrides || {}));
  }

  it("renames a neighborhood but never moves it to another zone", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Old Block");
    await asOperations();
    const out = await run(() => updateNeighborhoodAction(null, updateForm(n._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Neighborhood.findById(n._id).lean();
    expect(saved.name).toBe("Renamed Block");
    expect(saved.nameKey).toBe("renamedblock");
    expect(saved.description).toBe("New text");
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(await AuditLog.countDocuments({ action: "neighborhood.update" })).toBe(1);
  });

  it("refuses a name that another neighborhood in the same zone uses, but allows it in another zone", async () => {
    const a = await makeZone("Zone A");
    const b = await makeZone("Zone B");
    await makeNeighborhood(a, "Taken Name");
    const inA = await makeNeighborhood(a, "Other Name");
    const inB = await makeNeighborhood(b, "Third Name");
    await asOperations();
    const clash = await run(() => updateNeighborhoodAction(null, updateForm(inA._id, { name: "taken-name" })));
    expect(clash.result.error).toMatch(/already has/i);
    expect((await Neighborhood.findById(inA._id).lean()).name).toBe("Other Name");
    const fine = await run(() => updateNeighborhoodAction(null, updateForm(inB._id, { name: "taken-name" })));
    expect(fine.result.success).toBeTruthy();
  });

  it("refuses a bad id, an unknown neighborhood and a role without permission", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();
    const a = await run(() => updateNeighborhoodAction(null, updateForm("nope")));
    expect(a.result.error).toMatch(/invalid/i);
    const b = await run(() => updateNeighborhoodAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const c = await run(() => updateNeighborhoodAction(null, updateForm(n._id)));
    expect(c.result.error).toMatch(/permission/i);
  });
});

describe("setNeighborhoodStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ neighborhoodId: String(id), target: target, reason: reason });
  }

  it("needs a real reason to deactivate, then reactivates", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();

    const none = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Merged into the neighbouring block"))
    );
    expect(ok.result.success).toBeTruthy();
    let saved = await Neighborhood.findById(n._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Merged into the neighbouring block");

    const twice = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    saved = await Neighborhood.findById(n._id).lean();
    expect(saved.status).toBe("ACTIVE");
    expect(saved.statusReason).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: "neighborhood.status.inactive" })).toBe(1);
  });

  it("does not reactivate a neighborhood whose zone is inactive", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const n = await makeNeighborhood(zone, "Some Block", { status: "INACTIVE" });
    await asOperations();
    const out = await run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "ACTIVE")));
    expect(out.result.error).toMatch(/zone is not active/i);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("INACTIVE");
  });

  it("lets only one request win when two deactivations arrive at the same time", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    await asOperations();
    const results = await Promise.all([
      run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "First request at the same time"))),
      run(() => setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Second request at the same time"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "neighborhood.status.inactive" })).toBe(1);
  });

  it("refuses a resident, a content manager and a visitor", async () => {
    const zone = await makeZone("Zone A");
    const n = await makeNeighborhood(zone, "Some Block");
    for (const role of ["RESIDENT", "CONTENT_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() =>
        setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "I should not be allowed to"))
      );
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() =>
      setNeighborhoodStatusAction(null, statusForm(n._id, "INACTIVE", "Nobody is logged in here"))
    );
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Neighborhood.findById(n._id).lean()).status).toBe("ACTIVE");
  });
});
