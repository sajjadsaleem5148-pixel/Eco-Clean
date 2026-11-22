import { describe, it, expect } from "vitest";
import { notificationsPathFor, formatBadgeCount } from "@/lib/notificationLinks";

describe("notificationsPathFor", () => {
  it("sends each role to its own notifications page", () => {
    expect(notificationsPathFor("RESIDENT")).toBe("/dashboard/notifications");
    expect(notificationsPathFor("COLLECTOR")).toBe("/collector/notifications");
    ["SUPER_ADMIN", "OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "CONTENT_MANAGER", "READ_ONLY_ANALYST"].forEach((r) => {
      expect(notificationsPathFor(r)).toBe("/admin/notifications");
    });
  });

  it("returns null for an unknown or missing role", () => {
    expect(notificationsPathFor("HACKER")).toBeNull();
    expect(notificationsPathFor(undefined)).toBeNull();
    expect(notificationsPathFor("")).toBeNull();
  });
});

describe("formatBadgeCount", () => {
  it("shows nothing for zero, missing or bad values", () => {
    [0, -3, null, undefined, NaN, "5", Infinity].forEach((v) => expect(formatBadgeCount(v)).toBe(""));
  });

  it("shows the number up to 99 and 99+ above that", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(4500)).toBe("99+");
  });
});
