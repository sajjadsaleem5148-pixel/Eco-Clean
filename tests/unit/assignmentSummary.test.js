import { describe, it, expect } from "vitest";
import { ACTIVE_JOB_STATUSES, summarizeByCollector, hoursSince } from "@/lib/assignmentSummary";

describe("hoursSince", () => {
  const NOW = new Date("2026-11-20T12:00:00Z");

  it("counts whole hours", () => {
    expect(hoursSince(new Date("2026-11-20T09:30:00Z"), NOW)).toBe(2);
    expect(hoursSince(new Date("2026-11-19T12:00:00Z"), NOW)).toBe(24);
  });

  it("never goes below zero", () => {
    expect(hoursSince(new Date("2026-11-21T12:00:00Z"), NOW)).toBe(0);
  });

  it("returns null for a missing or bad date", () => {
    expect(hoursSince(undefined, NOW)).toBeNull();
    expect(hoursSince(null, NOW)).toBeNull();
    expect(hoursSince("not a date", NOW)).toBeNull();
  });
});

describe("summarizeByCollector", () => {
  it("lists the four active job statuses", () => {
    expect(ACTIVE_JOB_STATUSES).toEqual(["ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"]);
  });

  it("counts jobs per collector and per status", () => {
    const rows = summarizeByCollector([
      { collectorId: "a", collectorName: "Ali", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "ARRIVED" },
      { collectorId: "b", collectorName: "Bilal", status: "ACCEPTED" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      collectorId: "a",
      name: "Ali",
      total: 2,
      ASSIGNED: 1,
      ACCEPTED: 0,
      ON_THE_WAY: 0,
      ARRIVED: 1,
    });
    expect(rows[1].total).toBe(1);
  });

  it("puts the busiest collector first, then sorts by name", () => {
    const rows = summarizeByCollector([
      { collectorId: "z", collectorName: "Zara", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "ASSIGNED" },
      { collectorId: "m", collectorName: "Mona", status: "ASSIGNED" },
      { collectorId: "m", collectorName: "Mona", status: "ACCEPTED" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Mona", "Ali", "Zara"]);
  });

  it("skips jobs without a collector and jobs that are not active", () => {
    const rows = summarizeByCollector([
      { collectorId: "", collectorName: "Nobody", status: "ASSIGNED" },
      { collectorId: "a", collectorName: "Ali", status: "COLLECTED" },
      { collectorId: "a", collectorName: "Ali", status: "VERIFIED" },
      null,
    ]);
    expect(rows).toEqual([]);
  });

  it("copes with empty or missing input", () => {
    expect(summarizeByCollector([])).toEqual([]);
    expect(summarizeByCollector(undefined)).toEqual([]);
  });
});
