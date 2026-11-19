// Fresh produce is deliberately not a category: it needs supplier, expiry and storage controls first.
export const VENDOR_CATEGORIES = {
  PLANTS: "Plants and seedlings",
  GARDENING: "Gardening supplies",
  CLEANING: "Cleaning essentials",
  SEGREGATION_KITS: "Waste-separation kits",
  RECYCLING: "Recycling supplies",
  COMPOSTING: "Composting equipment",
  COMMUNITY: "Community-improvement supplies",
  OTHER: "Other",
};

export const VENDOR_STATUSES = ["PENDING", "APPROVED", "INACTIVE"];

export const VENDOR_STATUS_LABELS = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const VENDOR_STATUS_FROM = {
  APPROVED: ["PENDING", "INACTIVE"],
  INACTIVE: ["PENDING", "APPROVED"],
};

export const VENDOR_REASON_REQUIRED = ["INACTIVE"];

export function vendorTargets(status) {
  return Object.keys(VENDOR_STATUS_FROM).filter((t) => VENDOR_STATUS_FROM[t].includes(status));
}

export function vendorTargetLabel(current, target) {
  if (target === "APPROVED") return current === "PENDING" ? "Approve vendor" : "Reactivate vendor";
  if (target === "INACTIVE") return "Deactivate vendor";
  return target;
}

export const PHONE_PATTERN = /^[+]?[0-9 ()-]{6,25}$/;

export function isPlainEmail(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same vendor.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasContact(vendor) {
  return Boolean(vendor && ((vendor.email && vendor.email.length > 0) || (vendor.phone && vendor.phone.length > 0)));
}
