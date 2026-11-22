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
import { updateProfileAction } from "@/actions/profile";
import User from "@/models/User";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

describe("updateProfileAction", () => {
  it("changes only the signed-in resident's name", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const otherName = other.name;
    signInAs(me);

    const out = await run(() => updateProfileAction(null, form({ name: "  New    Name " })));
    expect(out.result.success).toBeTruthy();

    const saved = await User.findById(me._id).lean();
    expect(saved.name).toBe("New Name");
    expect(saved.email).toBe(me.email);
    expect(saved.role).toBe("RESIDENT");
    expect((await User.findById(other._id).lean()).name).toBe(otherName);
  });

  it("ignores attempts to change the email or the role through the form", async () => {
    const me = await makeUser();
    signInAs(me);
    await run(() =>
      updateProfileAction(null, form({ name: "New Name", email: "hacker@example.com", role: "SUPER_ADMIN", status: "ACTIVE" }))
    );
    const saved = await User.findById(me._id).lean();
    expect(saved.email).toBe(me.email);
    expect(saved.role).toBe("RESIDENT");
  });

  it("accepts a name written in Urdu", async () => {
    const me = await makeUser();
    signInAs(me);
    const out = await run(() => updateProfileAction(null, form({ name: "عائشہ خان" })));
    expect(out.result.success).toBeTruthy();
    expect((await User.findById(me._id).lean()).name).toBe("عائشہ خان");
  });

  it("refuses short, symbol-only, bracketed and very long names", async () => {
    const me = await makeUser();
    signInAs(me);
    const a = await run(() => updateProfileAction(null, form({ name: "a" })));
    expect(a.result.error).toMatch(/at least 2/i);
    const b = await run(() => updateProfileAction(null, form({ name: "!!!" })));
    expect(b.result.error).toMatch(/valid name/i);
    const c = await run(() => updateProfileAction(null, form({ name: "<b>Bob</b>" })));
    expect(c.result.error).toMatch(/valid name/i);
    const d = await run(() => updateProfileAction(null, form({ name: "x".repeat(121) })));
    expect(d.result.error).toMatch(/too long/i);
    expect((await User.findById(me._id).lean()).name).toBe(me.name);
  });

  it("refuses collectors, staff and visitors", async () => {
    for (const role of ["COLLECTOR", "SUPER_ADMIN", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
      expect(out.result.error).toMatch(/permission/i);
      expect((await User.findById(user._id).lean()).name).toBe(user.name);
    }
    signOut();
    const visitor = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
    expect(visitor.result.error).toMatch(/permission/i);
  });

  it("does not change a suspended resident", async () => {
    const me = await makeUser({ status: "SUSPENDED" });
    signInAs(me);
    const out = await run(() => updateProfileAction(null, form({ name: "Changed Name" })));
    expect(out.result.error).toMatch(/could not be found/i);
    expect((await User.findById(me._id).lean()).name).toBe(me.name);
  });
});
