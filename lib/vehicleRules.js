export const VEHICLE_TYPES = {
  TRUCK: "Truck",
  PICKUP: "Pickup",
  VAN: "Van",
  HANDCART: "Handcart or small cart",
  OTHER: "Other",
};

export const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"];

export const VEHICLE_STATUS_LABELS = {
  ACTIVE: "Active",
  MAINTENANCE: "In maintenance",
  RETIRED: "Retired",
};

// New status -> the statuses it may come from. A retired vehicle never comes back.
export const VEHICLE_STATUS_FROM = {
  ACTIVE: ["MAINTENANCE"],
  MAINTENANCE: ["ACTIVE"],
  RETIRED: ["ACTIVE", "MAINTENANCE"],
};

export const VEHICLE_REASON_REQUIRED = ["MAINTENANCE", "RETIRED"];

// Reuses the existing badge colours: green, amber and red.
export const VEHICLE_BADGE = {
  ACTIVE: "ACTIVE",
  MAINTENANCE: "PENDING",
  RETIRED: "ARCHIVED",
};

export const TARGET_LABELS = {
  ACTIVE: "Return to service",
  MAINTENANCE: "Send to maintenance",
  RETIRED: "Retire vehicle",
};

export function vehicleTargets(status) {
  return VEHICLE_STATUSES.filter((t) => VEHICLE_STATUS_FROM[t].includes(status));
}

export const PLATE_PATTERN = /^[A-Z0-9][A-Z0-9 -]{2,14}$/;

export function normalizePlate(value) {
  return String(value == null ? "" : value).toUpperCase().replace(/\s+/g, " ").trim();
}

export function isValidPlate(value) {
  return PLATE_PATTERN.test(normalizePlate(value));
}

// Spaces and hyphens are ignored, so ABC 123, ABC-123 and abc123 are the same vehicle.
export function plateKeyOf(value) {
  return normalizePlate(value).replace(/[ -]/g, "");
}
