export const ROUTE_STATUSES = ["DRAFT", "ACTIVE", "INACTIVE"];

export const ROUTE_STATUS_LABELS = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from. A route never goes back to draft.
export const ROUTE_STATUS_FROM = {
  ACTIVE: ["DRAFT", "INACTIVE"],
  INACTIVE: ["DRAFT", "ACTIVE"],
};

export const ROUTE_REASON_REQUIRED = ["INACTIVE"];

export const MIN_STOPS_TO_ACTIVATE = 2;
export const MAX_STOPS = 40;
export const MAX_STOP_LENGTH = 100;

export function routeTargets(status) {
  return Object.keys(ROUTE_STATUS_FROM).filter((t) => ROUTE_STATUS_FROM[t].includes(status));
}

export function routeTargetLabel(current, target) {
  if (target === "ACTIVE") return current === "DRAFT" ? "Activate route" : "Reactivate route";
  if (target === "INACTIVE") return "Deactivate route";
  return target;
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same route.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// One stop per line. The order is kept. Blank lines are dropped and repeats (any capitalisation) are kept once.
export function parseStops(text) {
  const lines = String(text == null ? "" : text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    if (line.length > MAX_STOP_LENGTH) {
      return { error: "each stop must be " + MAX_STOP_LENGTH + " characters or fewer." };
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }
  if (items.length > MAX_STOPS) {
    return { error: "use no more than " + MAX_STOPS + " stops." };
  }
  return { items };
}
