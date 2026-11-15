import { describe, it, expect } from "vitest";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, safeLink, clip } from "@/lib/notificationTypes";

describe("safeLink", () => {
  it("keeps paths inside the site", () => {
    expect(safeLink("/dashboard/reports/ECR-20261101-ABCDEF12")).toBe("/dashboard/reports/ECR-20261101-ABCDEF12");
    expect(safeLink("/admin/orders?status=PENDING")).toBe("/admin/orders?status=PENDING");
  });

  it("drops full URLs, protocol-relative links and script links", () => {
    expect(safeLink("https://evil.example")).toBeUndefined();
    expect(safeLink("http://evil.example/x")).toBeUndefined();
    expect(safeLink("//evil.example")).toBeUndefined();
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("/ok<script>")).toBeUndefined();
  });

  it("drops empty, missing and non-text values", () => {
    expect(safeLink("")).toBeUndefined();
    expect(safeLink(undefined)).toBeUndefined();
    expect(safeLink(null)).toBeUndefined();
    expect(safeLink(42)).toBeUndefined();
  });

  it("drops a path that is too long", () => {
    expect(safeLink("/" + "a".repeat(300))).toBeUndefined();
  });
});

describe("notification settings", () => {
  it("has a label for every type", () => {
    NOTIFICATION_TYPES.forEach((t) => expect(NOTIFICATION_TYPE_LABELS[t]).toBeTruthy());
  });

  it("clips long text and tolerates missing text", () => {
    expect(clip("abcdef", 3)).toBe("abc");
    expect(clip("abc", 10)).toBe("abc");
    expect(clip(undefined, 5)).toBe("");
  });
});
