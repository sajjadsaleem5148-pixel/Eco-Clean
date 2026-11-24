import { describe, it, expect } from "vitest";
import { formatCount, isAllZero } from "@/lib/impactFormat";

describe("formatCount", () => {
  it("adds thousands separators and keeps zero", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("shows a dash for anything that is not a real count", () => {
    [null, undefined, NaN, Infinity, -5, "5", {}].forEach((v) => expect(formatCount(v)).toBe("-"));
  });
});

describe("isAllZero", () => {
  it("is true only when every figure is zero", () => {
    expect(isAllZero({ a: 0, b: 0 })).toBe(true);
    expect(isAllZero({ a: 0, b: 1 })).toBe(false);
    expect(isAllZero({ a: 0, b: null })).toBe(false);
    expect(isAllZero({})).toBe(false);
    expect(isAllZero(undefined)).toBe(false);
  });
});
