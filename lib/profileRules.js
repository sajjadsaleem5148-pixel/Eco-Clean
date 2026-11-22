export const NAME_MIN = 2;
export const NAME_MAX = 120;

export function normalizeDisplayName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

// A name needs at least one letter or number, and no angle brackets or control characters.
export function isValidDisplayName(value) {
  const name = normalizeDisplayName(value);
  if (name.length < NAME_MIN || name.length > NAME_MAX) return false;
  if (/[<>\u0000-\u001f\u007f]/.test(name)) return false;
  return /[\p{L}\p{N}]/u.test(name);
}
