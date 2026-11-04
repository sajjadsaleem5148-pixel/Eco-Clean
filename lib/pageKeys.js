export const PAGE_KEYS = {
  ABOUT: { label: "About ECO-CLEAN", path: "/about" },
  PRIVACY: { label: "Privacy Policy", path: "/privacy" },
  TERMS: { label: "Terms of Service", path: "/terms" },
};

export const PAGE_KEY_LIST = Object.keys(PAGE_KEYS);

export const PAGE_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const PAGE_OPS = ["publish", "unpublish", "archive"];

export const PAGE_OP_FROM = {
  publish: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  unpublish: ["PUBLISHED"],
  archive: ["DRAFT", "PUBLISHED"],
};

export const PAGE_OP_TARGET = {
  publish: "PUBLISHED",
  unpublish: "DRAFT",
  archive: "ARCHIVED",
};

export const ANN_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ANN_STATUS_LABELS = PAGE_STATUS_LABELS;

export const ANN_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const ANN_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function annTargets(status) {
  return ANN_STATUSES.filter((t) => ANN_STATUS_FROM[t].includes(status));
}
