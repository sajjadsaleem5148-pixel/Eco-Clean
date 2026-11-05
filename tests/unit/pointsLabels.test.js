import { describe, it, expect } from "vitest";
import { TYPE_LABELS, MAX_POINTS_PER_ENTRY, formatPoints } from "@/lib/points/labels";

describe("formatPoints", () => {
  it("shows a plus sign for gains", () => {
    expect(formatPoints(5)).toBe("+5");
  });

  it("shows a minus sign for deductions", () => {
    expect(formatPoints(-5)).toBe("-5");
  });

  it("shows zero without a sign", () => {
    expect(formatPoints(0)).toBe("0");
  });
});

describe("points settings", () => {
  it("has a label for every transaction type", () => {
    ["EARN", "REDEEM", "REFUND", "ADJUST", "REVERSAL"].forEach((t) => {
      expect(TYPE_LABELS[t]).toBeTruthy();
    });
  });

  it("limits one entry to 1000 points", () => {
    expect(MAX_POINTS_PER_ENTRY).toBe(1000);
  });
});
