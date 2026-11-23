import { describe, it, expect } from "vitest";
import { OVERDUE_STATUSES, verifiedAtOf, overdueInfo } from "@/lib/overdue";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T12:00:00Z");

function report(status, verifiedDaysAgo) {
  return {
    status: status,
    statusHistory: [
      { status: "SUBMITTED", at: new Date(NOW.getTime() - 10 * DAY) },
      { status: "VERIFIED", at: new Date(NOW.getTime() - verifiedDaysAgo * DAY) },
    ],
  };
}

describe("verifiedAtOf", () => {
  it("finds the time of verification", () => {
    expect(verifiedAtOf(report("VERIFIED", 2).statusHistory).getTime()).toBe(NOW.getTime() - 2 * DAY);
  });

  it("returns null when there is no verification or the history is bad", () => {
    expect(verifiedAtOf([{ status: "SUBMITTED", at: new Date() }])).toBeNull();
    expect(verifiedAtOf(undefined)).toBeNull();
    expect(verifiedAtOf([{ status: "VERIFIED", at: "not a date" }])).toBeNull();
  });
});

describe("overdueInfo", () => {
  it("is overdue when the zone target has passed", () => {
    const info = overdueInfo(report("ASSIGNED", 4), 3, NOW);
    expect(info.hoursLate).toBe(24);
    expect(info.dueAt.getTime()).toBe(NOW.getTime() - 1 * DAY);
  });

  it("is not overdue before the target date, or exactly on it", () => {
    expect(overdueInfo(report("VERIFIED", 2), 3, NOW)).toBeNull();
    expect(overdueInfo(report("VERIFIED", 3), 3, NOW)).toBeNull();
  });

  it("uses the zone's own target", () => {
    expect(overdueInfo(report("VERIFIED", 2), 1, NOW)).not.toBeNull();
    expect(overdueInfo(report("VERIFIED", 2), 7, NOW)).toBeNull();
  });

  it("ignores finished reports and reports that are not verified yet", () => {
    ["COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED", "SUBMITTED", "UNDER_REVIEW"].forEach((s) => {
      expect(overdueInfo(report(s, 30), 3, NOW)).toBeNull();
    });
    expect(OVERDUE_STATUSES).toEqual(["VERIFIED", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"]);
  });

  it("ignores a missing verification time and a bad zone target", () => {
    expect(overdueInfo({ status: "ASSIGNED", statusHistory: [] }, 3, NOW)).toBeNull();
    expect(overdueInfo(report("ASSIGNED", 9), 0, NOW)).toBeNull();
    expect(overdueInfo(report("ASSIGNED", 9), undefined, NOW)).toBeNull();
    expect(overdueInfo(null, 3, NOW)).toBeNull();
  });
});
