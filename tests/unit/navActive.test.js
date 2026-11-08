import { describe, it, expect } from "vitest";
import { isActive } from "@/lib/navActive";

describe("isActive", () => {
  it("matches overview links exactly", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/users", "/admin")).toBe(false);
    expect(isActive("/dashboard/reports", "/dashboard")).toBe(false);
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("matches a section and its child pages", () => {
    expect(isActive("/admin/users", "/admin/users")).toBe(true);
    expect(isActive("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActive("/dashboard/reports/ECR-1", "/dashboard/reports")).toBe(true);
  });

  it("does not match a different section that shares a prefix", () => {
    expect(isActive("/admin/security-center", "/admin/security")).toBe(false);
    expect(isActive("/admin/reports", "/admin/report")).toBe(false);
  });

  it("does not match unrelated sections", () => {
    expect(isActive("/admin/orders", "/admin/users")).toBe(false);
  });

  it("returns false when a value is missing", () => {
    expect(isActive(null, "/admin")).toBe(false);
    expect(isActive("/admin", undefined)).toBe(false);
    expect(isActive("", "")).toBe(false);
  });
});
