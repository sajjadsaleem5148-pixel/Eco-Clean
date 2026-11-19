import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_FROM,
  campaignTargets,
  isValidDay,
  validateDates,
  campaignPhase,
} from "@/lib/campaignRules";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("campaign status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    CAMPAIGN_STATUSES.forEach((s) => expect(CAMPAIGN_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(CAMPAIGN_STATUS_FROM).forEach(([to, froms]) => {
      expect(CAMPAIGN_STATUSES).toContain(to);
      froms.forEach((f) => expect(CAMPAIGN_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(campaignTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(campaignTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(campaignTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(campaignTargets("MADE_UP")).toEqual([]);
  });
});

describe("dates", () => {
  it("accepts only real days written as YYYY-MM-DD", () => {
    expect(isValidDay("2026-11-20")).toBe(true);
    ["2026-02-30", "2026-13-01", "2026-1-5", "abc", "", null, undefined].forEach((v) => {
      expect(isValidDay(v)).toBe(false);
    });
  });

  it("accepts empty dates and a sensible range", () => {
    expect(validateDates("", "")).toBeNull();
    expect(validateDates("2026-11-01", "")).toBeNull();
    expect(validateDates("", "2026-11-30")).toBeNull();
    expect(validateDates("2026-11-01", "2026-11-01")).toBeNull();
  });

  it("rejects bad dates and an end before the start", () => {
    expect(validateDates("2026-02-30", "")).toMatch(/start date/i);
    expect(validateDates("", "nope")).toMatch(/end date/i);
    expect(validateDates("2026-11-10", "2026-11-09")).toMatch(/must not be before/i);
  });
});

describe("campaignPhase", () => {
  it("is running when there are no dates", () => {
    expect(campaignPhase({}, NOW)).toBe("ACTIVE");
  });

  it("is upcoming before the start date and running on it", () => {
    expect(campaignPhase({ startDate: "2026-11-21" }, NOW)).toBe("UPCOMING");
    expect(campaignPhase({ startDate: "2026-11-20" }, NOW)).toBe("ACTIVE");
  });

  it("is running on the end date and ended after it", () => {
    expect(campaignPhase({ endDate: "2026-11-20" }, NOW)).toBe("ACTIVE");
    expect(campaignPhase({ endDate: "2026-11-19" }, NOW)).toBe("ENDED");
  });

  it("uses both dates together", () => {
    expect(campaignPhase({ startDate: "2026-11-01", endDate: "2026-11-30" }, NOW)).toBe("ACTIVE");
    expect(campaignPhase({ startDate: "2026-12-01", endDate: "2026-12-31" }, NOW)).toBe("UPCOMING");
    expect(campaignPhase({ startDate: "2026-10-01", endDate: "2026-10-31" }, NOW)).toBe("ENDED");
  });
});
