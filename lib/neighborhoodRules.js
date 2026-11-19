export const NEIGHBORHOOD_STATUSES = ["ACTIVE", "INACTIVE"];

export const NEIGHBORHOOD_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const NEIGHBORHOOD_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const NEIGHBORHOOD_REASON_REQUIRED = ["INACTIVE"];

export function neighborhoodTargets(status) {
  return NEIGHBORHOOD_STATUSES.filter((t) => NEIGHBORHOOD_STATUS_FROM[t].includes(status));
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same neighborhood.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}
