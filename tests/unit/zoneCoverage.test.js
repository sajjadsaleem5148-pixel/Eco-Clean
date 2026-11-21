import { describe, it, expect } from "vitest";
import { toCountMap, coverageGaps, buildCoverageRows } from "@/lib/zoneCoverage";

describe("toCountMap", () => {
  it("turns grouped rows into a map and keeps rows without a zone under none", () => {
    const map = toCountMap([
      { _id: "a", count: 2 },
      { _id: null, count: 3 },
      { _id: "b", count: 1 },
    ]);
    expect(map).toEqual({ a: 2, none: 3, b: 1 });
  });

  it("adds counts that share a key and ignores bad counts", () => {
    expect(toCountMap([{ _id: "a", count: 1 }, { _id: "a", count: 4 }, { _id: "b", count: "x" }])).toEqual({
      a: 5,
      b: 0,
    });
  });

  it("copes with empty or missing input", () => {
    expect(toCountMap([])).toEqual({});
    expect(toCountMap(undefined)).toEqual({});
    expect(toCountMap([null])).toEqual({ none: 0 });
  });
});

describe("coverageGaps", () => {
  it("reports a missing collector and a missing schedule on an active zone", () => {
    expect(coverageGaps({ status: "ACTIVE", collectors: 0, schedules: 0 })).toEqual([
      "No active collector",
      "No confirmed schedule",
    ]);
    expect(coverageGaps({ status: "ACTIVE", collectors: 2, schedules: 0 })).toEqual(["No confirmed schedule"]);
    expect(coverageGaps({ status: "ACTIVE", collectors: 0, schedules: 1 })).toEqual(["No active collector"]);
  });

  it("reports nothing for a covered zone, an inactive zone or a missing row", () => {
    expect(coverageGaps({ status: "ACTIVE", collectors: 1, schedules: 1 })).toEqual([]);
    expect(coverageGaps({ status: "INACTIVE", collectors: 0, schedules: 0 })).toEqual([]);
    expect(coverageGaps(null)).toEqual([]);
  });
});

describe("buildCoverageRows", () => {
  it("builds one row per zone, sorted by name, with zero for missing counts", () => {
    const rows = buildCoverageRows(
      [
        { _id: "b", name: "Zone B", status: "ACTIVE" },
        { _id: "a", name: "Zone A", status: "INACTIVE" },
      ],
      {
        residents: { b: 4 },
        neighborhoods: { b: 2 },
        collectors: { b: 1 },
        schedules: { b: 3 },
        openReports: {},
      }
    );
    expect(rows.map((r) => r.name)).toEqual(["Zone A", "Zone B"]);
    expect(rows[0]).toEqual({
      id: "a",
      name: "Zone A",
      status: "INACTIVE",
      residents: 0,
      neighborhoods: 0,
      collectors: 0,
      schedules: 0,
      openReports: 0,
      gaps: [],
    });
    expect(rows[1].residents).toBe(4);
    expect(rows[1].gaps).toEqual([]);
  });

  it("copes with missing input", () => {
    expect(buildCoverageRows(undefined, undefined)).toEqual([]);
    expect(buildCoverageRows([{ _id: "a", name: "Zone A", status: "ACTIVE" }], undefined)[0].gaps).toEqual([
      "No active collector",
      "No confirmed schedule",
    ]);
  });
});
