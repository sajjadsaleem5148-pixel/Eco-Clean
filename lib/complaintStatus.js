export const COMPLAINT_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "REJECTED", "ESCALATED",
];

export const COMPLAINT_STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  ESCALATED: "Escalated",
};

export const COMPLAINT_CATEGORIES = {
  MISSED_COLLECTION: "Missed collection",
  OVERFLOWING_BINS: "Overflowing bins",
  ILLEGAL_DUMPING: "Illegal dumping",
  DAMAGED_CONTAINER: "Damaged container",
  WORKER_MISCONDUCT: "Worker misconduct",
  INCORRECT_POINTS: "Incorrect Green Points",
  HAZARDOUS_WASTE: "Hazardous-waste concern",
  INCORRECT_SCHEDULE: "Incorrect schedule",
  SEGREGATION_DISPUTE: "Segregation dispute",
  OTHER: "Other cleanliness issue",
};

export const OPEN_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"];

// Naya status -> kin statuses se allowed.
export const STATUS_FROM = {
  UNDER_REVIEW: ["SUBMITTED", "ESCALATED"],
  IN_PROGRESS: ["ASSIGNED"],
  RESOLVED: ["UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED"],
  ESCALATED: ["SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS"],
};

export const STAFF_DECISIONS = Object.keys(STATUS_FROM);

export const DECISION_LABELS = {
  UNDER_REVIEW: "Mark as Under Review",
  IN_PROGRESS: "Mark as In Progress",
  RESOLVED: "Resolve complaint",
  REJECTED: "Reject complaint",
  ESCALATED: "Escalate complaint",
};

export const REASON_REQUIRED = ["RESOLVED", "REJECTED", "ESCALATED"];

export const ASSIGNABLE_FROM = ["SUBMITTED", "UNDER_REVIEW", "ESCALATED", "ASSIGNED", "IN_PROGRESS"];

export const COMPLAINT_STAFF_ROLES = ["SUPER_ADMIN", "COMPLAINTS_MANAGER", "SUPPORT_AGENT"];

export const REOPEN_WINDOW_DAYS = 7;
export const MAX_REOPENS = 1;

export function decisionsFor(status) {
  return STAFF_DECISIONS.filter((d) => STATUS_FROM[d].includes(status));
}
