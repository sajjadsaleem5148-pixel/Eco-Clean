export const SCHEDULE_STATUSES = ["DRAFT", "CONFIRMED", "CANCELLED"];

export const SCHEDULE_STATUS_LABELS = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
};

// New status -> the statuses it may come from.
export const SCHEDULE_STATUS_FROM = {
  CONFIRMED: ["DRAFT"],
  CANCELLED: ["DRAFT", "CONFIRMED"],
};

export const SCHEDULE_TARGET_LABELS = {
  CONFIRMED: "Confirm schedule",
  CANCELLED: "Cancel schedule",
};

export const SCHEDULE_REASON_REQUIRED = ["CANCELLED"];

export function scheduleTargets(status) {
  return Object.keys(SCHEDULE_STATUS_FROM).filter((t) => SCHEDULE_STATUS_FROM[t].includes(status));
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayLabel(n) {
  return WEEKDAYS[n] || "-";
}

// 24-hour HH:MM
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTime(value) {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

export function isValidWindow(start, end) {
  return isValidTime(start) && isValidTime(end) && start < end;
}

// Two windows overlap only if each one starts before the other ends. Touching windows do not overlap.
export function windowsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function formatWindow(start, end) {
  return start + " - " + end;
}
