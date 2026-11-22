export const TESTIMONIAL_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const TESTIMONIAL_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const TESTIMONIAL_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const TESTIMONIAL_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const MAX_PUBLIC_TESTIMONIALS = 12;
export const QUOTE_MIN = 20;
export const QUOTE_MAX = 400;
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const DETAIL_MAX = 80;
export const CONSENT_NOTE_MIN = 5;
export const CONSENT_NOTE_MAX = 200;

export function testimonialTargets(status) {
  return TESTIMONIAL_STATUSES.filter((t) => TESTIMONIAL_STATUS_FROM[t].includes(status));
}

export function normalizeText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// No angle brackets and no control characters in any public text.
export function hasUnsafeCharacters(value) {
  return /[<>\u0000-\u001f\u007f]/.test(String(value == null ? "" : value));
}

export function isValidQuote(value) {
  const text = normalizeText(value);
  return text.length >= QUOTE_MIN && text.length <= QUOTE_MAX && !hasUnsafeCharacters(text);
}

// A name needs at least one letter or number.
export function isValidPersonName(value) {
  const name = normalizeText(value);
  if (name.length < NAME_MIN || name.length > NAME_MAX) return false;
  if (hasUnsafeCharacters(name)) return false;
  return /[\p{L}\p{N}]/u.test(name);
}

export function isValidDetail(value) {
  const text = normalizeText(value);
  return text.length <= DETAIL_MAX && !hasUnsafeCharacters(text);
}
