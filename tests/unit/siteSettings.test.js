import { describe, it, expect } from "vitest";
import { safeHttpsUrl, isPlainEmail, telHref, PHONE_PATTERN, FIELD_KEYS } from "@/lib/siteSettings";

describe("safeHttpsUrl", () => {
  it("accepts a normal https address", () => {
    expect(safeHttpsUrl("https://facebook.com/ecoclean")).toBe("https://facebook.com/ecoclean");
    expect(safeHttpsUrl("  https://www.instagram.com/eco  ")).toBe("https://www.instagram.com/eco");
  });

  it("drops script, http and other schemes", () => {
    expect(safeHttpsUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpsUrl("http://facebook.com/eco")).toBeUndefined();
    expect(safeHttpsUrl("data:text/html,hi")).toBeUndefined();
    expect(safeHttpsUrl("ftp://example.com/file")).toBeUndefined();
  });

  it("drops links with a username or password and bare hosts", () => {
    expect(safeHttpsUrl("https://user:secret@example.com")).toBeUndefined();
    expect(safeHttpsUrl("https://localhost")).toBeUndefined();
  });

  it("drops empty, non-text and very long values", () => {
    expect(safeHttpsUrl("")).toBeUndefined();
    expect(safeHttpsUrl("   ")).toBeUndefined();
    expect(safeHttpsUrl(undefined)).toBeUndefined();
    expect(safeHttpsUrl(42)).toBeUndefined();
    expect(safeHttpsUrl("https://example.com/" + "a".repeat(300))).toBeUndefined();
  });
});

describe("isPlainEmail and phone", () => {
  it("accepts normal emails and rejects odd ones", () => {
    expect(isPlainEmail("hello@example.com")).toBe(true);
    ["", "no-at-sign", "a@b", "a b@example.com", "<x>@example.com", null, undefined].forEach((v) => {
      expect(isPlainEmail(v)).toBe(false);
    });
  });

  it("accepts normal phone numbers and rejects letters", () => {
    ["+92 21 1234567", "(021) 123-4567", "0300 1234567"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(true));
    ["call me", "12", "<script>", ""].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(false));
  });

  it("builds a tel link with digits and plus only", () => {
    expect(telHref("+92 (21) 123-4567")).toBe("tel:+92211234567");
  });
});

describe("field list", () => {
  it("has the four contact fields and five social links", () => {
    expect(FIELD_KEYS).toHaveLength(9);
    expect(FIELD_KEYS).toContain("contactEmail");
    expect(FIELD_KEYS).toContain("youtubeUrl");
  });
});
