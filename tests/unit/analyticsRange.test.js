import { describe, it, expect } from "vitest";
import { parseRange, MAX_RANGE_DAYS } from "@/lib/analyticsRange";

const NOW = new Date("2026-11-15T10:00:00Z");

describe("parseRange", () => {
  it("defaults to the last 30 days including today", () => {
    const r = parseRange("", "", NOW);
    expect(r.toStr).toBe("2026-11-15");
    expect(r.fromStr).toBe("2026-10-17");
    expect(r.days).toBe(30);
    expect(r.toExclusive.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });

  it("uses the dates it is given", () => {
    const r = parseRange("2026-01-01", "2026-01-31", NOW);
    expect(r.days).toBe(31);
    expect(r.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("counts back 30 days from the end date when only the end is given", () => {
    const r = parseRange("", "2026-03-31", NOW);
    expect(r.fromStr).toBe("2026-03-02");
    expect(r.days).toBe(30);
  });

  it("rejects dates that are not real", () => {
    expect(parseRange("2026-02-30", "2026-03-01", NOW).error).toBeTruthy();
    expect(parseRange("abc", "2026-03-01", NOW).error).toBeTruthy();
    expect(parseRange("2026-03-01", "2026-13-01", NOW).error).toBeTruthy();
    expect(parseRange("2026-3-1", "2026-03-05", NOW).error).toBeTruthy();
  });

  it("rejects a start date after the end date", () => {
    expect(parseRange("2026-05-02", "2026-05-01", NOW).error).toMatch(/must not be after/i);
  });

  it("allows the maximum range and rejects anything longer", () => {
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(parseRange("2026-01-01", "2026-01-01", NOW).days).toBe(1);
    expect(parseRange("2025-01-01", "2026-01-01", NOW).days).toBe(366);
    expect(parseRange("2025-01-01", "2026-01-02", NOW).error).toMatch(/too long/i);
  });

  it("ignores values that are not text", () => {
    expect(parseRange(["2026-01-01"], 42, NOW).error).toBeTruthy();
  });
});
