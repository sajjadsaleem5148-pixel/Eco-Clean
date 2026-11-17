import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { getDatabaseHealth, getSecuritySnapshot } from "@/services/systemStatus";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

describe("getDatabaseHealth", () => {
  it("reports a reachable replica set", async () => {
    const health = await getDatabaseHealth();
    expect(health.ok).toBe(true);
    expect(typeof health.ms).toBe("number");
    expect(health.replicaSet).toBe(true);
  });
});

describe("getSecuritySnapshot", () => {
  it("reports a missing root admin on an empty database", async () => {
    const snap = await getSecuritySnapshot();
    expect(snap).toEqual({
      rootAdminActive: false,
      activeStaff: 0,
      suspendedAccounts: 0,
      auditEntries: 0,
      latestAuditAt: null,
    });
  });

  it("counts active staff, suspended accounts and audit entries", async () => {
    await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true });
    await makeUser({ role: "SUPPORT_AGENT" });
    await makeUser({ role: "CONTENT_MANAGER", status: "SUSPENDED" });
    await makeUser({ role: "RESIDENT", status: "SUSPENDED" });
    await makeUser({ role: "RESIDENT" });
    await AuditLog.create({ action: "test.one" });
    await AuditLog.create({ action: "test.two" });

    const snap = await getSecuritySnapshot();
    expect(snap.rootAdminActive).toBe(true);
    expect(snap.activeStaff).toBe(2);
    expect(snap.suspendedAccounts).toBe(2);
    expect(snap.auditEntries).toBe(2);
    expect(snap.latestAuditAt).toBeTruthy();
  });

  it("does not count a suspended root admin as active", async () => {
    await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true, status: "SUSPENDED" });
    const snap = await getSecuritySnapshot();
    expect(snap.rootAdminActive).toBe(false);
  });

  it("returns counts only, never names or emails", async () => {
    const admin = await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true });
    const snap = await getSecuritySnapshot();
    const text = JSON.stringify(snap);
    expect(text.includes(admin.email)).toBe(false);
    expect(text.includes(admin.name)).toBe(false);
  });
});
