export const BANNER_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const BANNER_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// New status -> the statuses it may come from.
export const BANNER_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const BANNER_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export const MAX_PUBLIC_BANNERS = 3;
export const DEFAULT_LINK_LABEL = "Learn more";
export const MAX_LINK_LABEL = 30;

export function bannerTargets(status) {
  return BANNER_STATUSES.filter((t) => BANNER_STATUS_FROM[t].includes(status));
}

// Only a path inside this site or a full https address is allowed.
// Script links, http links, protocol-relative links, links with a password and bare hosts are dropped.
// Returns the safe link, or undefined.
export function safeBannerLink(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 200) return undefined;
  if (text.startsWith("//")) return undefined;
  if (text.startsWith("/")) {
    return /^[/][A-Za-z0-9/_.?=&#-]{0,198}$/.test(text) ? text : undefined;
  }
  let url;
  try {
    url = new URL(text);
  } catch (err) {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname.includes(".")) return undefined;
  return url.toString();
}

export function isInternalLink(link) {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//");
}
