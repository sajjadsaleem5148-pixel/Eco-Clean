export const PRODUCT_CATEGORIES = {
  PLANTS: "Plants",
  GARDENING: "Gardening supplies",
  CLEANING: "Cleaning essentials",
  SEGREGATION_KITS: "Waste-separation kits",
  RECYCLING: "Recycling supplies",
  COMPOSTING: "Composting equipment",
  COMMUNITY: "Community-improvement supplies",
};

export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const PRODUCT_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// Naya status -> kin statuses se allowed.
export const PRODUCT_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const PRODUCT_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function productTargets(status) {
  return PRODUCT_STATUSES.filter((t) => PRODUCT_STATUS_FROM[t].includes(status));
}

export const FULFILLMENT_LABELS = {
  PICKUP: "Collect from a pickup point",
  DISPATCH: "Dispatched to you",
};

export const ORDER_STATUSES = [
  "PENDING", "APPROVED", "REJECTED", "PREPARING",
  "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "CANCELLED",
];

export const ORDER_STATUS_LABELS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PREPARING: "Preparing",
  READY_FOR_COLLECTION: "Ready for Collection",
  DISPATCHED: "Dispatched",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_TRANSITIONS = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_COLLECTION", "DISPATCHED", "CANCELLED"],
  READY_FOR_COLLECTION: ["COMPLETED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
};

export const STAFF_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s !== "PENDING");

export const REASON_REQUIRED_ORDER = ["REJECTED", "CANCELLED"];

export function nextOrderStatuses(status, fulfillment) {
  return (ORDER_TRANSITIONS[status] || []).filter(
    (s) =>
      !(s === "READY_FOR_COLLECTION" && fulfillment !== "PICKUP") &&
      !(s === "DISPATCHED" && fulfillment !== "DISPATCH")
  );
}

export const MOVEMENT_LABELS = {
  RESTOCK: "Restock",
  ADJUST: "Correction",
  RESERVE: "Reserved (order)",
  RELEASE: "Released (order cancelled)",
  FULFILL: "Fulfilled (order completed)",
};
