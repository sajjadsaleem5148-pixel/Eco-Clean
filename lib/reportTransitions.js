export const REVIEW_FROM = {
  UNDER_REVIEW: ["SUBMITTED"],
  VERIFIED: ["SUBMITTED", "UNDER_REVIEW"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW"],
};

export const REVIEW_DECISIONS = Object.keys(REVIEW_FROM);

export const DECISION_LABELS = {
  UNDER_REVIEW: "Mark as Under Review",
  VERIFIED: "Verify report",
  REJECTED: "Reject report",
};

export function decisionsFor(status) {
  return REVIEW_DECISIONS.filter((d) => REVIEW_FROM[d].includes(status));
}

// Assignment: Verified se pehli dafa, Assigned se reassign (collector ke accept karne se pehle).
export const ASSIGNABLE_FROM = ["VERIFIED", "ASSIGNED"];

// Collector ke steps: naya status -> kin statuses se allowed.
export const COLLECTOR_FROM = {
  ACCEPTED: ["ASSIGNED"],
  ON_THE_WAY: ["ACCEPTED"],
  ARRIVED: ["ON_THE_WAY"],
  COLLECTED: ["ARRIVED"],
  UNABLE_TO_COLLECT: ["ACCEPTED", "ON_THE_WAY", "ARRIVED"],
};

export const COLLECTOR_STEPS = Object.keys(COLLECTOR_FROM);

export const COLLECTOR_LABELS = {
  ACCEPTED: "Accept job",
  ON_THE_WAY: "Mark On the Way",
  ARRIVED: "Mark Arrived",
  COLLECTED: "Mark Collected",
  UNABLE_TO_COLLECT: "Report Unable to Collect",
};

export const NOTE_REQUIRED = ["COLLECTED", "UNABLE_TO_COLLECT"];

export function collectorStepsFor(status) {
  return COLLECTOR_STEPS.filter((s) => COLLECTOR_FROM[s].includes(status));
}
