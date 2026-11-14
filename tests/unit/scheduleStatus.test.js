import { describe, it, expect } from "vitest";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_STATUS_FROM,
  SCHEDULE_REASON_REQUIRED,
  WEEKDAYS,
  scheduleTargets,
  weekdayLabel,
  isValidTime,
  isValidWindow,
  windowsOverlap,
  formatWindow,
} from "@/lib/scheduleStatus";

describe("schedule status", () => {
  it("has a label for every status", () => {
    SCHEDULE_STATUSES.forEach((s) => expect(SCHEDULE_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses", () => {
    Object.entries(SCHEDULE_STATUS_FROM).forEach(([to, froms]) => {
      expect(SCHEDULE_STATUSES).toContain(to);
      froms.forEach((f) => expect(SCHEDULE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(scheduleTargets("DRAFT")).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(scheduleTargets("CONFIRMED")).toEqual(["CANCELLED"]);
    expect(scheduleTargets("CANCELLED")).toEqual([]);
    expect(scheduleTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to cancel", () => {
    expect(SCHEDULE_REASON_REQUIRED).toEqual(["CANCELLED"]);
  });
});

describe("weekdays", () => {
  it("has seven days starting on Sunday", () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(weekdayLabel(0)).toBe("Sunday");
    expect(weekdayLabel(6)).toBe("Saturday");
    expect(weekdayLabel(9)).toBe("-");
  });
});

describe("time windows", () => {
  it("accepts valid 24-hour times only", () => {
    ["00:00", "08:30", "23:59"].forEach((t) => expect(isValidTime(t)).toBe(true));
    ["24:00", "8:30", "12:60", "ab:cd", "", null, undefined].forEach((t) => expect(isValidTime(t)).toBe(false));
  });

  it("needs the end to be after the start", () => {
    expect(isValidWindow("08:00", "10:00")).toBe(true);
    expect(isValidWindow("10:00", "08:00")).toBe(false);
    expect(isValidWindow("08:00", "08:00")).toBe(false);
    expect(isValidWindow("08:00", "bad")).toBe(false);
  });

  it("detects overlapping windows and lets touching windows through", () => {
    expect(windowsOverlap("08:00", "10:00", "09:00", "11:00")).toBe(true);
    expect(windowsOverlap("08:00", "10:00", "08:30", "09:00")).toBe(true);
    expect(windowsOverlap("08:00", "10:00", "10:00", "12:00")).toBe(false);
    expect(windowsOverlap("08:00", "10:00", "06:00", "08:00")).toBe(false);
    expect(windowsOverlap("08:00", "10:00", "13:00", "15:00")).toBe(false);
  });

  it("formats a window", () => {
    expect(formatWindow("08:00", "10:00")).toBe("08:00 - 10:00");
  });
});
