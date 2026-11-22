export const ARTICLE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const ARTICLE_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const ARTICLE_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const ARTICLE_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const ARTICLE_CATEGORIES = {
  GENERAL: "General guidance",
  SEGREGATION: "Waste segregation",
  RECYCLING: "Recycling basics",
  COMPOSTING: "Composting",
  COMMUNITY: "Community action",
  SAFETY: "Safe handling",
};

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 200;
export const BODY_MIN = 50;
export const BODY_MAX = 8000;
export const SLUG_MAX = 60;

export function articleTargets(status) {
  return ARTICLE_STATUSES.filter((t) => ARTICLE_STATUS_FROM[t].includes(status));
}

export function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// The body keeps its line breaks.
export function normalizeBody(value) {
  return String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
}

// No angle brackets and no control characters.
export function hasUnsafeCharacters(value) {
  return /[<>\u0000-\u001f\u007f]/.test(String(value == null ? "" : value));
}

// Same, but line breaks and tabs are allowed in the body.
export function hasUnsafeBodyCharacters(value) {
  return /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(String(value == null ? "" : value));
}

// Web address made from the title. It can be empty when the title has no a-z or 0-9 at all.
export function makeSlug(title) {
  return String(title == null ? "" : title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function isValidSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length <= SLUG_MAX;
}

// Returns an error message, or null when everything is fine.
export function validateArticleFields(fields) {
  const f = fields || {};
  const title = normalizeText(f.title);
  const summary = normalizeText(f.summary);
  const body = normalizeBody(f.body);
  if (title.length < TITLE_MIN) return "Title must be at least " + TITLE_MIN + " characters.";
  if (title.length > TITLE_MAX) return "Title is too long (" + TITLE_MAX + " characters maximum).";
  if (hasUnsafeCharacters(title)) return "The title must not contain < or > characters.";
  if (summary.length < SUMMARY_MIN) return "Summary must be at least " + SUMMARY_MIN + " characters.";
  if (summary.length > SUMMARY_MAX) return "Summary is too long (" + SUMMARY_MAX + " characters maximum).";
  if (hasUnsafeCharacters(summary)) return "The summary must not contain < or > characters.";
  if (body.length < BODY_MIN) return "The article text must be at least " + BODY_MIN + " characters.";
  if (body.length > BODY_MAX) return "The article text is too long (" + BODY_MAX + " characters maximum).";
  if (hasUnsafeBodyCharacters(body)) return "The article text must not contain < or > characters.";
  if (!Object.prototype.hasOwnProperty.call(ARTICLE_CATEGORIES, f.category)) return "Please choose a category.";
  return null;
}
