import { describe, it, expect } from "vitest";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STAFF_ROLES,
  OPEN_STATUSES,
  STATUS_FROM,
  REASON_REQUIRED,
  REOPEN_WINDOW_DAYS,
  MAX_REOPENS,
  decisionsFor,
} from "@/lib/complaintStatus";

describe("complaint statuses", () => {
  it("has seven statuses, each with a label", () => {
    expect(COMPLAINT_STATUSES).toHaveLength(7);
    COMPLAINT_STATUSES.forEach((s) => expect(COMPLAINT_STATUS_LABELS[s]).toBeTruthy());
  });

  it("has ten categories", () => {
    expect(Object.keys(COMPLAINT_CATEGORIES)).toHaveLength(10);
    expect(COMPLAINT_CATEGORIES.HAZARDOUS_WASTE).toBeTruthy();
  });

  it("only refers to real statuses in the transition table", () => {
    Object.entries(STATUS_FROM).forEach(([to, froms]) => {
      expect(COMPLAINT_STATUSES).toContain(to);
      froms.forEach((f) => expect(COMPLAINT_STATUSES).toContain(f));
    });
    OPEN_STATUSES.forEach((s) => expect(COMPLAINT_STATUSES).toContain(s));
  });

  it("does not count resolved or rejected complaints as open", () => {
    expect(OPEN_STATUSES).not.toContain("RESOLVED");
    expect(OPEN_STATUSES).not.toContain("REJECTED");
  });
});

describe("staff decisions", () => {
  it("offers sensible choices on a new complaint", () => {
    expect(decisionsFor("SUBMITTED")).toEqual(["UNDER_REVIEW", "REJECTED", "ESCALATED"]);
  });

  it("offers progress choices on an assigned complaint", () => {
    expect(decisionsFor("ASSIGNED")).toEqual(["IN_PROGRESS", "RESOLVED", "REJECTED", "ESCALATED"]);
  });

  it("cannot escalate an escalated complaint again", () => {
    expect(decisionsFor("ESCALATED")).toEqual(["UNDER_REVIEW", "REJECTED"]);
  });

  it("offers nothing on resolved or rejected complaints", () => {
    expect(decisionsFor("RESOLVED")).toEqual([]);
    expect(decisionsFor("REJECTED")).toEqual([]);
  });

  it("requires a reason to resolve, reject or escalate", () => {
    expect(REASON_REQUIRED).toEqual(["RESOLVED", "REJECTED", "ESCALATED"]);
  });
});

describe("policies", () => {
  it("allows one reopen within seven days", () => {
    expect(REOPEN_WINDOW_DAYS).toBe(7);
    expect(MAX_REOPENS).toBe(1);
  });

  it("never lets residents or collectors be complaint staff", () => {
    expect(COMPLAINT_STAFF_ROLES).not.toContain("RESIDENT");
    expect(COMPLAINT_STAFF_ROLES).not.toContain("COLLECTOR");
    expect(COMPLAINT_STAFF_ROLES).toContain("SUPER_ADMIN");
  });
});
