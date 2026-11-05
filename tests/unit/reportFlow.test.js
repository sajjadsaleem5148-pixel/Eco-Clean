import { describe, it, expect } from "vitest";
import {
  REPORT_STATUSES,
  CLOSED_STATUSES,
  STATUS_LABELS,
  formatDateTime,
} from "@/lib/reportStatus";
import {
  REVIEW_FROM,
  COLLECTOR_FROM,
  ASSIGNABLE_FROM,
  NOTE_REQUIRED,
  decisionsFor,
  collectorStepsFor,
} from "@/lib/reportTransitions";

describe("report statuses", () => {
  it("has eleven statuses, each with a label", () => {
    expect(REPORT_STATUSES).toHaveLength(11);
    REPORT_STATUSES.forEach((s) => expect(STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses in the transition tables", () => {
    Object.entries(REVIEW_FROM).forEach(([to, froms]) => {
      expect(REPORT_STATUSES).toContain(to);
      froms.forEach((f) => expect(REPORT_STATUSES).toContain(f));
    });
    Object.entries(COLLECTOR_FROM).forEach(([to, froms]) => {
      expect(REPORT_STATUSES).toContain(to);
      froms.forEach((f) => expect(REPORT_STATUSES).toContain(f));
    });
    ASSIGNABLE_FROM.forEach((s) => expect(REPORT_STATUSES).toContain(s));
  });

  it("formats dates in UTC", () => {
    expect(formatDateTime(new Date("2026-11-05T10:30:00Z"))).toBe("2026-11-05 10:30 UTC");
  });
});

describe("staff review decisions", () => {
  it("offers all three decisions on a new report", () => {
    expect(decisionsFor("SUBMITTED")).toEqual(["UNDER_REVIEW", "VERIFIED", "REJECTED"]);
  });

  it("does not offer Under Review twice", () => {
    expect(decisionsFor("UNDER_REVIEW")).toEqual(["VERIFIED", "REJECTED"]);
  });

  it("offers no review decision once a report is verified", () => {
    expect(decisionsFor("VERIFIED")).toEqual([]);
    expect(decisionsFor("ASSIGNED")).toEqual([]);
  });

  it("offers nothing on closed reports", () => {
    CLOSED_STATUSES.forEach((s) => expect(decisionsFor(s)).toEqual([]));
  });
});

describe("collector steps", () => {
  it("only allows accepting a newly assigned job", () => {
    expect(collectorStepsFor("ASSIGNED")).toEqual(["ACCEPTED"]);
  });

  it("moves one step at a time", () => {
    expect(collectorStepsFor("ACCEPTED")).toEqual(["ON_THE_WAY", "UNABLE_TO_COLLECT"]);
    expect(collectorStepsFor("ON_THE_WAY")).toEqual(["ARRIVED", "UNABLE_TO_COLLECT"]);
    expect(collectorStepsFor("ARRIVED")).toEqual(["COLLECTED", "UNABLE_TO_COLLECT"]);
  });

  it("never allows Collected before Arrived", () => {
    ["ASSIGNED", "ACCEPTED", "ON_THE_WAY"].forEach((s) => {
      expect(collectorStepsFor(s)).not.toContain("COLLECTED");
    });
  });

  it("offers nothing on closed reports", () => {
    CLOSED_STATUSES.forEach((s) => expect(collectorStepsFor(s)).toEqual([]));
  });

  it("requires a note for Collected and Unable to Collect", () => {
    expect(NOTE_REQUIRED).toEqual(["COLLECTED", "UNABLE_TO_COLLECT"]);
  });

  it("allows assigning only verified or already assigned reports", () => {
    expect(ASSIGNABLE_FROM).toEqual(["VERIFIED", "ASSIGNED"]);
  });
});
