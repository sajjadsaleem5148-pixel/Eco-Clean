export const REPORT_STATUSES = [
  "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "ACCEPTED",
  "ON_THE_WAY", "ARRIVED", "COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED",
];

export const CLOSED_STATUSES = ["COLLECTED", "UNABLE_TO_COLLECT", "REJECTED", "CANCELLED"];

export const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  VERIFIED: "Verified",
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ON_THE_WAY: "On the Way",
  ARRIVED: "Arrived",
  COLLECTED: "Collected",
  UNABLE_TO_COLLECT: "Unable to Collect",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export function formatDateTime(value) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
