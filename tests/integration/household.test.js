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
import { saveZoneAction } from "@/actions/household";
import { confirmedForZone, confirmedForCollector } from "@/services/scheduleQueries";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

async function makeZone(name, extra) {
  return ServiceZone.create(
    Object.assign({ name: name, slug: name.toLowerCase().replace(/ /g, "-") }, extra || {})
  );
}

function makeSchedule(zone, collector, overrides) {
  return CollectionSchedule.create(
    Object.assign(
      {
        serviceZone: zone._id,
        collector: collector._id,
        weekday: 1,
        startTime: "08:00",
        endTime: "10:00",
        status: "CONFIRMED",
      },
      overrides || {}
    )
  );
}

describe("saveZoneAction", () => {
  it("saves an active zone on the signed-in resident only", async () => {
    const zone = await makeZone("Zone A");
    const resident = await makeUser();
    const other = await makeUser();
    signInAs(resident);

    const out = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(out.result.success).toBeTruthy();

    const saved = await User.findById(resident._id).lean();
    expect(String(saved.serviceZone)).toBe(String(zone._id));
    expect(saved.role).toBe("RESIDENT");
    const untouched = await User.findById(other._id).lean();
    expect(untouched.serviceZone).toBeUndefined();
  });

  it("refuses an inactive zone and a malformed id", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const resident = await makeUser();
    signInAs(resident);

    const a = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(a.result.error).toMatch(/not available/i);
    const b = await run(() => saveZoneAction(null, form({ zoneId: "not-an-id" })));
    expect(b.result.error).toMatch(/choose a zone/i);
    expect((await User.findById(resident._id).lean()).serviceZone).toBeUndefined();
  });

  it("refuses a collector, a staff account and a visitor", async () => {
    const zone = await makeZone("Zone A");
    const collector = await makeUser({ role: "COLLECTOR" });
    const admin = await makeUser({ role: "SUPER_ADMIN" });

    signInAs(collector);
    const a = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(admin);
    const b = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(b.result.error).toMatch(/permission/i);
    signOut();
    const c = await run(() => saveZoneAction(null, form({ zoneId: String(zone._id) })));
    expect(c.result.error).toMatch(/permission/i);

    expect((await User.findById(collector._id).lean()).serviceZone).toBeUndefined();
  });
});

describe("confirmedForZone", () => {
  it("returns only confirmed schedules of that zone, without the collector", async () => {
    const zoneA = await makeZone("Zone A");
    const zoneB = await makeZone("Zone B");
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zoneA._id });
    await makeSchedule(zoneA, collector, { weekday: 3, startTime: "09:00", endTime: "11:00" });
    await makeSchedule(zoneA, collector, { weekday: 1, startTime: "08:00", endTime: "10:00" });
    await makeSchedule(zoneA, collector, { weekday: 2, status: "DRAFT" });
    await makeSchedule(zoneA, collector, { weekday: 4, status: "CANCELLED" });
    await makeSchedule(zoneB, collector, { weekday: 5 });

    const result = await confirmedForZone(zoneA._id);
    expect(result.zone.name).toBe("Zone A");
    expect(result.schedules.map((s) => s.weekday)).toEqual([1, 3]);
    result.schedules.forEach((s) => {
      expect(Object.keys(s).sort()).toEqual(["endTime", "id", "startTime", "weekday"]);
    });
    expect(JSON.stringify(result).includes(String(collector._id))).toBe(false);
  });

  it("returns nothing for an inactive zone", async () => {
    const zone = await makeZone("Zone A", { status: "INACTIVE" });
    const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await makeSchedule(zone, collector);
    const result = await confirmedForZone(zone._id);
    expect(result.zone).toBeNull();
    expect(result.schedules).toEqual([]);
  });
});

describe("confirmedForCollector", () => {
  it("returns only this collector's confirmed schedules", async () => {
    const zone = await makeZone("Zone A");
    const mine = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    const theirs = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
    await makeSchedule(zone, mine, { weekday: 2, note: "Use the back gate" });
    await makeSchedule(zone, mine, { weekday: 5, status: "DRAFT" });
    await makeSchedule(zone, theirs, { weekday: 3 });

    const list = await confirmedForCollector(mine._id);
    expect(list).toHaveLength(1);
    expect(list[0].weekday).toBe(2);
    expect(list[0].zoneName).toBe("Zone A");
    expect(list[0].note).toBe("Use the back gate");
  });
});
