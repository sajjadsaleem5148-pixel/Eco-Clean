import { describe, it, expect } from "vitest";
import { waitingHours, hoursText } from "@/lib/supportOverview";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("waitingHours", () => {
  it("counts whole hours", () => {
    expect(waitingHours(new Date("2026-11-20T09:30:00Z"), NOW)).toBe(2);
    expect(waitingHours(new Date("2026-11-19T12:00:00Z"), NOW)).toBe(24);
  });

  it("never goes below zero", () => {
    expect(waitingHours(new Date("2026-11-21T12:00:00Z"), NOW)).toBe(0);
  });

  it("returns null for a missing or bad date", () => {
    expect(waitingHours(undefined, NOW)).toBeNull();
    expect(waitingHours(null, NOW)).toBeNull();
    expect(waitingHours("not a date", NOW)).toBeNull();
  });
});

describe("hoursText", () => {
  it("formats hours and leaves a missing value empty", () => {
    expect(hoursText(5)).toBe("5 h");
    expect(hoursText(0)).toBe("0 h");
    expect(hoursText(null)).toBeNull();
    expect(hoursText(undefined)).toBeNull();
  });
});
