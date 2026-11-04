export const CONTACT_CATEGORIES = {
  GENERAL: "General question",
  SERVICES: "Services and availability",
  COLLECTION: "Collection schedule",
  REWARDS: "Green Points and rewards",
  PARTNERSHIP: "Partnership or business enquiry",
  TECHNICAL: "Website problem",
  OTHER: "Other",
};

export const CONTACT_STATUSES = ["NEW", "IN_PROGRESS", "RESPONDED", "CLOSED"];

export const CONTACT_STATUS_LABELS = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  RESPONDED: "Responded",
  CLOSED: "Closed",
};

// Naya status -> kin statuses se allowed.
export const STATUS_FROM = {
  IN_PROGRESS: ["NEW", "RESPONDED", "CLOSED"],
  CLOSED: ["NEW", "IN_PROGRESS", "RESPONDED"],
};

export const STAFF_DECISIONS = Object.keys(STATUS_FROM);

export const DECISION_LABELS = {
  IN_PROGRESS: "Mark as In Progress (or reopen)",
  CLOSED: "Close message",
};

export const REPLYABLE = ["NEW", "IN_PROGRESS", "RESPONDED"];

export function decisionsFor(status) {
  return STAFF_DECISIONS.filter((d) => STATUS_FROM[d].includes(status));
}
