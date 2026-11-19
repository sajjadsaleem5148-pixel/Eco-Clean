export const CAMPAIGN_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const CAMPAIGN_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const CAMPAIGN_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const CAMPAIGN_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function campaignTargets(status) {
  return CAMPAIGN_STATUSES.filter((t) => CAMPAIGN_STATUS_FROM[t].includes(status));
}

export const PHASE_LABELS = {
  ACTIVE: "Running now",
  UPCOMING: "Not started yet",
  ENDED: "Ended",
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar day written as YYYY-MM-DD.
export function isValidDay(value) {
  if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;
  const d = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayString(now) {
  return (now || new Date()).toISOString().slice(0, 10);
}

// Both dates are optional. Returns an error message, or null when the dates are fine.
export function validateDates(start, end) {
  const s = start || "";
  const e = end || "";
  if (s && !isValidDay(s)) return "The start date is not a valid date.";
  if (e && !isValidDay(e)) return "The end date is not a valid date.";
  if (s && e && s > e) return "The end date must not be before the start date.";
  return null;
}

// Dates are inclusive UTC days. A campaign with no dates is always running.
export function campaignPhase(campaign, now) {
  const today = todayString(now);
  const start = campaign && campaign.startDate ? campaign.startDate : "";
  const end = campaign && campaign.endDate ? campaign.endDate : "";
  if (start && today < start) return "UPCOMING";
  if (end && today > end) return "ENDED";
  return "ACTIVE";
}
