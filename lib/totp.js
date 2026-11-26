import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Time-based one-time passwords (RFC 6238) built on HOTP (RFC 4226). Pure functions, no database.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// Spaces, hyphens and = are ignored. Any other character is an error.
export function base32Decode(text) {
  const clean = String(text == null ? "" : text).toUpperCase().replace(/[ =-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32 text");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret() {
  return base32Encode(randomBytes(20));
}

export function hotp(key, counter, digits) {
  const d = digits || DIGITS;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(buf).digest();
  const offset = h[19] & 15;
  const bin =
    ((h[offset] & 127) << 24) | ((h[offset + 1] & 255) << 16) | ((h[offset + 2] & 255) << 8) | (h[offset + 3] & 255);
  return String(bin % Math.pow(10, d)).padStart(d, "0");
}

export function counterAt(timeMs, step) {
  return Math.floor(timeMs / 1000 / (step || STEP_SECONDS));
}

export function totp(secret, timeMs, options) {
  const o = options || {};
  return hotp(base32Decode(secret), counterAt(timeMs, o.step), o.digits);
}

// Returns the counter that matched (so a used code can be refused later), or null.
// The window is how many steps before and after the current one are accepted.
export function verifyTotp(secret, token, timeMs, window) {
  if (typeof token !== "string" || !/^[0-9]{6}$/.test(token)) return null;
  let key;
  try {
    key = base32Decode(secret);
  } catch (err) {
    return null;
  }
  if (key.length === 0) return null;
  const w = window === undefined ? 1 : window;
  const base = counterAt(timeMs);
  const given = Buffer.from(token);
  let matched = null;
  for (let i = -w; i <= w; i++) {
    const counter = base + i;
    if (counter < 0) continue;
    const expected = Buffer.from(hotp(key, counter, DIGITS));
    // Every candidate is compared, so the time taken does not show which one was right.
    if (timingSafeEqual(expected, given) && matched === null) matched = counter;
  }
  return matched;
}

export function otpauthUri(input) {
  const issuer = input.issuer;
  const account = input.account;
  return (
    "otpauth://totp/" +
    encodeURIComponent(issuer + ":" + account) +
    "?secret=" + input.secret +
    "&issuer=" + encodeURIComponent(issuer) +
    "&algorithm=SHA1&digits=" + DIGITS +
    "&period=" + STEP_SECONDS
  );
}

// Recovery codes use 32 characters (no I, O, 0 or 1), so one random byte maps evenly onto them.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateBackupCodes(count) {
  const n = count || 8;
  const codes = [];
  const seen = new Set();
  while (codes.length < n) {
    const bytes = randomBytes(10);
    let text = "";
    for (const b of bytes) text += CODE_CHARS[b & 31];
    const code = text.slice(0, 5) + "-" + text.slice(5);
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

// Accepts a code typed in any case, with or without the hyphen or spaces. Returns "" when it cannot be a code.
export function normalizeBackupCode(value) {
  const clean = String(value == null ? "" : value).toUpperCase().replace(/[ -]/g, "");
  if (clean.length !== 10) return "";
  for (const ch of clean) {
    if (CODE_CHARS.indexOf(ch) < 0) return "";
  }
  return clean.slice(0, 5) + "-" + clean.slice(5);
}
