import { describe, it, expect } from "vitest";
import { ROLES, ADMIN_ROLES, PERMISSIONS, hasPermission } from "@/lib/permissions/roles";

const others = Object.values(ROLES).filter((r) => r !== "SUPER_ADMIN");

describe("hasPermission", () => {
  it("denies when the role or permission is missing", () => {
    expect(hasPermission(null, "users.read")).toBe(false);
    expect(hasPermission(undefined, "users.read")).toBe(false);
    expect(hasPermission("", "users.read")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", undefined)).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "")).toBe(false);
  });

  it("denies an unknown role", () => {
    expect(hasPermission("HACKER", "users.read")).toBe(false);
    expect(hasPermission("super_admin", "users.read")).toBe(false);
  });

  it("denies an unknown permission, even for the Super Admin", () => {
    expect(hasPermission("SUPER_ADMIN", "nothing.here")).toBe(false);
  });

  it("gives the Super Admin every permission", () => {
    PERMISSIONS.forEach((p) => expect(hasPermission("SUPER_ADMIN", p)).toBe(true));
  });

  it("gives residents and collectors no admin permission", () => {
    PERMISSIONS.forEach((p) => {
      expect(hasPermission("RESIDENT", p)).toBe(false);
      expect(hasPermission("COLLECTOR", p)).toBe(false);
    });
  });

  it("keeps sensitive permissions for the Super Admin only", () => {
    const sensitive = [
      "points.adjust",
      "users.suspend",
      "admins.manage",
      "settings.manage",
      "security.manage",
      "audit.read",
      "analytics.export",
    ];
    sensitive.forEach((p) => {
      others.forEach((r) => expect(hasPermission(r, p)).toBe(false));
    });
  });

  it("gives each staff role only its own job", () => {
    expect(hasPermission("OPERATIONS_MANAGER", "reports.verify")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "reports.assign")).toBe(true);
    expect(hasPermission("OPERATIONS_MANAGER", "points.adjust")).toBe(false);

    expect(hasPermission("COMPLAINTS_MANAGER", "complaints.resolve")).toBe(true);
    expect(hasPermission("COMPLAINTS_MANAGER", "reports.verify")).toBe(false);

    expect(hasPermission("REWARDS_MANAGER", "rewards.manage")).toBe(true);
    expect(hasPermission("REWARDS_MANAGER", "inventory.manage")).toBe(true);
    expect(hasPermission("REWARDS_MANAGER", "content.publish")).toBe(false);

    expect(hasPermission("CONTENT_MANAGER", "content.publish")).toBe(true);
    expect(hasPermission("CONTENT_MANAGER", "users.read")).toBe(false);

    expect(hasPermission("SUPPORT_AGENT", "complaints.resolve")).toBe(true);
    expect(hasPermission("SUPPORT_AGENT", "rewards.manage")).toBe(false);

    expect(hasPermission("COLLECTOR_SUPERVISOR", "collections.manage")).toBe(true);
    expect(hasPermission("COLLECTOR_SUPERVISOR", "reports.verify")).toBe(false);

    expect(hasPermission("READ_ONLY_ANALYST", "analytics.read")).toBe(true);
    expect(hasPermission("READ_ONLY_ANALYST", "reports.verify")).toBe(false);
    expect(hasPermission("READ_ONLY_ANALYST", "points.adjust")).toBe(false);
  });
});

describe("role lists", () => {
  it("has ten roles whose values match their keys", () => {
    expect(Object.keys(ROLES)).toHaveLength(10);
    Object.entries(ROLES).forEach(([k, v]) => expect(v).toBe(k));
  });

  it("does not treat residents or collectors as admin roles", () => {
    expect(ADMIN_ROLES).toHaveLength(8);
    expect(ADMIN_ROLES).toContain("SUPER_ADMIN");
    expect(ADMIN_ROLES).not.toContain("RESIDENT");
    expect(ADMIN_ROLES).not.toContain("COLLECTOR");
  });

  it("only lists real roles as admin roles", () => {
    ADMIN_ROLES.forEach((r) => expect(Object.values(ROLES)).toContain(r));
  });
});
