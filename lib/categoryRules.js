export const CATEGORY_STATUSES = ["ACTIVE", "INACTIVE"];

export const CATEGORY_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const CATEGORY_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const CATEGORY_REASON_REQUIRED = ["INACTIVE"];

export function categoryTargets(status) {
  return CATEGORY_STATUSES.filter((t) => CATEGORY_STATUS_FROM[t].includes(status));
}

export const MAX_MATERIALS = 30;
export const MAX_MATERIAL_LENGTH = 100;
export const FALLBACK_COLOR = "#4b5563";

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Always returns a safe colour, even if a bad value was stored directly in the database.
export function safeColor(value) {
  return isHexColor(value) ? value.toLowerCase() : FALLBACK_COLOR;
}

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// White or near-black text, whichever has the better contrast on the given background.
export function textColorFor(hex) {
  const h = safeColor(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;
  return withWhite >= withBlack ? "#ffffff" : "#111111";
}

// One item per line. Blank lines are dropped and repeats (any capitalisation) are kept once.
export function parseMaterials(text) {
  const lines = String(text == null ? "" : text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    if (line.length > MAX_MATERIAL_LENGTH) {
      return { error: "each item must be " + MAX_MATERIAL_LENGTH + " characters or fewer." };
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }
  if (items.length > MAX_MATERIALS) {
    return { error: "use no more than " + MAX_MATERIALS + " items." };
  }
  return { items };
}

export function makeCategoryKey(name) {
  return String(name == null ? "" : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
