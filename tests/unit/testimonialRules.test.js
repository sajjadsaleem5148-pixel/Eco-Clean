import { describe, it, expect } from "vitest";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_LABELS,
  TESTIMONIAL_STATUS_FROM,
  MAX_PUBLIC_TESTIMONIALS,
  testimonialTargets,
  normalizeText,
  hasUnsafeCharacters,
  isValidQuote,
  isValidPersonName,
  isValidDetail,
} from "@/lib/testimonialRules";

describe("testimonial status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    TESTIMONIAL_STATUSES.forEach((s) => expect(TESTIMONIAL_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(TESTIMONIAL_STATUS_FROM).forEach(([to, froms]) => {
      expect(TESTIMONIAL_STATUSES).toContain(to);
      froms.forEach((f) => expect(TESTIMONIAL_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(testimonialTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(testimonialTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(testimonialTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(testimonialTargets("MADE_UP")).toEqual([]);
    expect(MAX_PUBLIC_TESTIMONIALS).toBe(12);
  });
});

describe("text rules", () => {
  it("normalises spacing", () => {
    expect(normalizeText("  a   b \n c ")).toBe("a b c");
    expect(normalizeText(null)).toBe("");
  });

  it("spots angle brackets and control characters", () => {
    expect(hasUnsafeCharacters("<b>x</b>")).toBe(true);
    expect(hasUnsafeCharacters("bad\u0007text")).toBe(true);
    expect(hasUnsafeCharacters("A normal sentence.")).toBe(false);
  });

  it("accepts a quote of the right length and rejects short, long or bracketed ones", () => {
    expect(isValidQuote("The pickup was on time every week.")).toBe(true);
    expect(isValidQuote("too short")).toBe(false);
    expect(isValidQuote("x".repeat(401))).toBe(false);
    expect(isValidQuote("x".repeat(400))).toBe(true);
    expect(isValidQuote("This quote has <script> in it, sadly.")).toBe(false);
  });

  it("accepts normal names, including non-English ones, and rejects odd ones", () => {
    ["Ayesha Khan", "Jean-Luc O'Neil", "Al"].forEach((n) => expect(isValidPersonName(n)).toBe(true));
    expect(isValidPersonName("عائشہ خان")).toBe(true);
    ["", "a", "!!!", "<b>Bob</b>", "x".repeat(81)].forEach((n) => expect(isValidPersonName(n)).toBe(false));
  });

  it("allows an empty role or place but not brackets or a long text", () => {
    expect(isValidDetail("")).toBe(true);
    expect(isValidDetail("Shopkeeper, Zone A")).toBe(true);
    expect(isValidDetail("<i>x</i>")).toBe(false);
    expect(isValidDetail("x".repeat(81))).toBe(false);
  });
});
