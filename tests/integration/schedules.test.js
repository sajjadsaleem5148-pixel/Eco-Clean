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
import { createScheduleAction, setScheduleStatusAction } from "@/actions/schedules";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

async function makeZone(name) {
  return ServiceZone.create({ name: name, slug: name.toLowerCase().replace(/ /g, "-") });
}

async function world() {
  const zone = await makeZone("Zone A");
  const collector = await makeUser({ role: "COLLECTOR", serviceZone: zone._id });
  const manager = await makeUser({ role: "OPERATIONS_MANAGER" });
  return { zone, collector, manager };
}

function createForm(w, overrides) {
  return form(
    Object.assign(
      {
        zoneId: String(w.zone._id),
        collectorId: String(w.collector._id),
        weekday: "1",
        startTime: "08:00",
        endTime: "10:00",
      },
      overrides || {}
    )
  );
}

function statusForm(id, target, reason) {
  return form({ scheduleId: String(id), target: target, reason: reason });
}

async function draft(w, overrides) {
  signInAs(w.manager);
  await run(() => createScheduleAction(null, createForm(w, overrides)));
  const all = await CollectionSchedule.find({}).sort({ _id: 1 }).lean();
  return all[all.length - 1];
}

describe("createScheduleAction", () => {
  it("saves a draft for a collector of the same zone", async () => {
    const w = await world();
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w)));
    expect(out.result.success).toBeTruthy();
    const saved = await CollectionSchedule.find({}).lean();
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("DRAFT");
    expect(saved[0].weekday).toBe(1);
  });

  it("refuses a collector from another zone", async () => {
    const w = await world();
    const other = await makeZone("Zone B");
    const stranger = await makeUser({ role: "COLLECTOR", serviceZone: other._id });
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w, { collectorId: String(stranger._id) })));
    expect(out.result.error).toMatch(/not assigned to the selected zone/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses an end time that is not after the start time", async () => {
    const w = await world();
    signInAs(w.manager);
    const out = await run(() => createScheduleAction(null, createForm(w, { startTime: "10:00", endTime: "08:00" })));
    expect(out.result.error).toMatch(/after the start/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a malformed time and an invalid weekday", async () => {
    const w = await world();
    signInAs(w.manager);
    const a = await run(() => createScheduleAction(null, createForm(w, { startTime: "25:00" })));
    expect(a.result.error).toMatch(/24-hour/i);
    const b = await run(() => createScheduleAction(null, createForm(w, { weekday: "9" })));
    expect(b.result.error).toMatch(/day/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a suspended collector and an inactive zone", async () => {
    const w = await world();
    await User.updateOne({ _id: w.collector._id }, { $set: { status: "SUSPENDED" } });
    signInAs(w.manager);
    const a = await run(() => createScheduleAction(null, createForm(w)));
    expect(a.result.error).toMatch(/not available/i);

    await User.updateOne({ _id: w.collector._id }, { $set: { status: "ACTIVE" } });
    await ServiceZone.updateOne({ _id: w.zone._id }, { $set: { status: "INACTIVE" } });
    const b = await run(() => createScheduleAction(null, createForm(w)));
    expect(b.result.error).toMatch(/not available/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });

  it("refuses a complaints manager, a resident and a visitor", async () => {
    const w = await world();
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });
    const resident = await makeUser();

    signInAs(complaints);
    const a = await run(() => createScheduleAction(null, createForm(w)));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(resident);
    const b = await run(() => createScheduleAction(null, createForm(w)));
    expect(b.result.error).toMatch(/permission/i);
    signOut();
    const c = await run(() => createScheduleAction(null, createForm(w)));
    expect(c.result.error).toMatch(/permission/i);
    expect(await CollectionSchedule.countDocuments({})).toBe(0);
  });
});

describe("setScheduleStatusAction", () => {
  it("confirms a draft once and records who confirmed it", async () => {
    const w = await world();
    const s = await draft(w);
    const first = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(first.result.success).toBeTruthy();
    const saved = await CollectionSchedule.findById(s._id).lean();
    expect(saved.status).toBe("CONFIRMED");
    expect(String(saved.confirmedBy)).toBe(String(w.manager._id));

    const again = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(again.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses a confirmed schedule that overlaps another one for the same collector and day", async () => {
    const w = await world();
    const a = await draft(w, { startTime: "08:00", endTime: "10:00" });
    const b = await draft(w, { startTime: "09:00", endTime: "11:00" });
    const okA = await run(() => setScheduleStatusAction(null, statusForm(a._id, "CONFIRMED")));
    expect(okA.result.success).toBeTruthy();
    const clash = await run(() => setScheduleStatusAction(null, statusForm(b._id, "CONFIRMED")));
    expect(clash.result.error).toMatch(/overlaps/i);
    expect((await CollectionSchedule.findById(b._id).lean()).status).toBe("DRAFT");
  });

  it("allows windows that only touch, and the same window on another day", async () => {
    const w = await world();
    const a = await draft(w, { startTime: "08:00", endTime: "10:00" });
    const touching = await draft(w, { startTime: "10:00", endTime: "12:00" });
    const otherDay = await draft(w, { weekday: "2", startTime: "08:00", endTime: "10:00" });
    for (const s of [a, touching, otherDay]) {
      const out = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
      expect(out.result.success).toBeTruthy();
    }
  });

  it("does not confirm when the collector became unavailable after the draft was saved", async () => {
    const w = await world();
    const s = await draft(w);
    await User.updateOne({ _id: w.collector._id }, { $set: { status: "SUSPENDED" } });
    const out = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(out.result.error).toMatch(/no longer available/i);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");
  });

  it("needs a real reason to cancel, and a cancelled schedule cannot be confirmed", async () => {
    const w = await world();
    const s = await draft(w);
    const none = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CANCELLED")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CANCELLED", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");

    const ok = await run(() =>
      setScheduleStatusAction(null, statusForm(s._id, "CANCELLED", "The route was merged into another one"))
    );
    expect(ok.result.success).toBeTruthy();
    const saved = await CollectionSchedule.findById(s._id).lean();
    expect(saved.status).toBe("CANCELLED");
    expect(saved.cancelReason).toBe("The route was merged into another one");

    const back = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(back.result.error).toMatch(/cannot be moved/i);
  });

  it("refuses a resident and a complaints manager", async () => {
    const w = await world();
    const s = await draft(w);
    const resident = await makeUser();
    const complaints = await makeUser({ role: "COMPLAINTS_MANAGER" });

    signInAs(resident);
    const a = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(a.result.error).toMatch(/permission/i);
    signInAs(complaints);
    const b = await run(() => setScheduleStatusAction(null, statusForm(s._id, "CONFIRMED")));
    expect(b.result.error).toMatch(/permission/i);
    expect((await CollectionSchedule.findById(s._id).lean()).status).toBe("DRAFT");
  });
});
