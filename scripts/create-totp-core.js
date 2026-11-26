const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}
if (!fs.existsSync("node_modules/vitest")) {
  console.error("FAILED: vitest is not installed (run npm install). Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/totp.js", `
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
`);

write("tests/unit/totp.test.js", `
import { describe, it, expect } from "vitest";
import {
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  totp,
  verifyTotp,
  otpauthUri,
  generateBackupCodes,
  normalizeBackupCode,
} from "@/lib/totp";

const KEY = Buffer.from("12345678901234567890");
const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("matches the known encoding of the RFC test key", () => {
    expect(base32Encode(KEY)).toBe(SECRET);
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
  });

  it("round-trips random bytes and ignores spaces, hyphens, case and padding", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 7, 8]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(base32Decode("gezd gnbv-GY3TQOJQ====").toString()).toBe("123456789012");
  });

  it("refuses characters that are not base32", () => {
    expect(() => base32Decode("ABC1")).toThrow();
    expect(() => base32Decode("ab!c")).toThrow();
  });
});

describe("HOTP (RFC 4226 test values)", () => {
  it("gives the ten published codes", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, counter) => expect(hotp(KEY, counter)).toBe(code));
  });
});

describe("TOTP (RFC 6238 test values, 8 digits)", () => {
  it("gives the published codes for the SHA-1 secret", () => {
    const cases = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    cases.forEach((c) => expect(totp(SECRET, c[0] * 1000, { digits: 8 })).toBe(c[1]));
  });
});

describe("verifyTotp", () => {
  const T = 1700000000000;
  const secret = generateSecret();

  it("accepts the current code and returns its counter", () => {
    const code = totp(secret, T);
    expect(verifyTotp(secret, code, T)).toBe(Math.floor(T / 30000));
  });

  it("accepts one step before and after, but not two", () => {
    expect(verifyTotp(secret, totp(secret, T - 30000), T)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, T + 30000), T)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, T - 90000), T)).toBeNull();
    expect(verifyTotp(secret, totp(secret, T + 90000), T)).toBeNull();
  });

  it("with a window of zero accepts only the current code", () => {
    expect(verifyTotp(secret, totp(secret, T - 30000), T, 0)).toBeNull();
    expect(verifyTotp(secret, totp(secret, T), T, 0)).not.toBeNull();
  });

  it("refuses a wrong code and anything that is not six digits", () => {
    const code = totp(secret, T);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(verifyTotp(secret, wrong, T)).toBeNull();
    ["", "12345", "1234567", "abcdef", "12 345", null, undefined, 123456].forEach((bad) => {
      expect(verifyTotp(secret, bad, T)).toBeNull();
    });
  });

  it("refuses a bad or empty secret without throwing", () => {
    expect(verifyTotp("not base32!", "123456", T)).toBeNull();
    expect(verifyTotp("", "123456", T)).toBeNull();
  });
});

describe("secrets and addresses", () => {
  it("makes a 32 character base32 secret that is different every time", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });

  it("builds an address an authenticator app can read", () => {
    const uri = otpauthUri({ issuer: "ECO-CLEAN", account: "admin@example.com", secret: SECRET });
    expect(uri.indexOf("otpauth://totp/ECO-CLEAN%3Aadmin%40example.com?")).toBe(0);
    expect(uri).toContain("secret=" + SECRET);
    expect(uri).toContain("issuer=ECO-CLEAN");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("makes eight different codes in the form XXXXX-XXXXX without confusing characters", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/));
  });

  it("normalises what a person types and refuses what cannot be a code", () => {
    expect(normalizeBackupCode("abcde fghjk")).toBe("ABCDE-FGHJK");
    expect(normalizeBackupCode("abcde-fghjk")).toBe("ABCDE-FGHJK");
    ["", "short", "ABCDE-FGHJ0", "ABCDE-FGHJI", null, undefined].forEach((v) => {
      expect(normalizeBackupCode(v)).toBe("");
    });
  });
});
`);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (f === "lib/totp.js") {
    if (/mongoose|@\/models|@\/services|connectDB/.test(code)) problems.push("must stay pure: no database");
    if (/Math\.random/.test(code)) problems.push("must not use Math.random");
    if (!code.includes("timingSafeEqual")) problems.push("comparison must be constant time");
  }
  if (f.startsWith("tests/") && !src.includes("describe(")) problems.push("no tests found");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test");