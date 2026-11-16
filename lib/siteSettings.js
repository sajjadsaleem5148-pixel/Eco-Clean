export const SETTINGS_KEY = "site";

export const SOCIAL_FIELDS = [
  { key: "facebookUrl", label: "Facebook" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "xUrl", label: "X (Twitter)" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "youtubeUrl", label: "YouTube" },
];

export const FIELD_KEYS = ["contactEmail", "contactPhone", "address", "openingHours"].concat(
  SOCIAL_FIELDS.map((f) => f.key)
);

export const PHONE_PATTERN = /^[+]?[0-9 ()-]{6,25}$/;

export function isPlainEmail(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
}

// Only a full https address is allowed. javascript:, http:, links with a password and bare hosts are dropped.
export function safeHttpsUrl(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 200) return undefined;
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

export function telHref(phone) {
  return "tel:" + String(phone || "").replace(/[^0-9+]/g, "");
}
