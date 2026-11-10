export const ZONE_STATUSES = ["ACTIVE", "INACTIVE"];

export const ZONE_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const ZONE_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const ZONE_REASON_REQUIRED = ["INACTIVE"];

export function zoneTargets(status) {
  return ZONE_STATUSES.filter((t) => ZONE_STATUS_FROM[t].includes(status));
}
