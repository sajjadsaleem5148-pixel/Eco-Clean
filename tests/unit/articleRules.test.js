import { describe, it, expect } from "vitest";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_LABELS,
  ARTICLE_STATUS_FROM,
  articleTargets,
  normalizeText,
  normalizeBody,
  hasUnsafeCharacters,
  hasUnsafeBodyCharacters,
  makeSlug,
  isValidSlug,
  validateArticleFields,
} from "@/lib/articleRules";

const good = {
  title: "How to sort household waste",
  summary: "A short guide to sorting waste at home.",
  body: "x".repeat(60),
  category: "SEGREGATION",
};

describe("article status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    ARTICLE_STATUSES.forEach((s) => expect(ARTICLE_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(ARTICLE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ARTICLE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ARTICLE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(articleTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(articleTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(articleTargets("ARCHIVED")).toEqual(["DRAFT"]);
    expect(articleTargets("MADE_UP")).toEqual([]);
  });
});

describe("text helpers", () => {
  it("normalises spacing and keeps line breaks in the body", () => {
    expect(normalizeText("  a   b \n c ")).toBe("a b c");
    expect(normalizeBody("line one\r\nline two  ")).toBe("line one\nline two");
  });

  it("spots unsafe characters, but allows line breaks in the body", () => {
    expect(hasUnsafeCharacters("<b>x</b>")).toBe(true);
    expect(hasUnsafeCharacters("a\nb")).toBe(true);
    expect(hasUnsafeBodyCharacters("a\nb\tc")).toBe(false);
    expect(hasUnsafeBodyCharacters("a <script> b")).toBe(true);
    expect(hasUnsafeBodyCharacters("bad\u0007text")).toBe(true);
  });
});

describe("slugs", () => {
  it("makes a short lowercase address from the title", () => {
    expect(makeSlug("Sorting Glass & Metal!")).toBe("sorting-glass-metal");
    expect(makeSlug("  Tips 101  ")).toBe("tips-101");
    expect(makeSlug("a".repeat(80)).length).toBeLessThanOrEqual(60);
  });

  it("gives an empty address when there is no a-z or 0-9", () => {
    expect(makeSlug("!!!")).toBe("");
    expect(makeSlug("عائشہ")).toBe("");
  });

  it("accepts only well-formed addresses", () => {
    ["sorting-glass", "tips-101", "a"].forEach((s) => expect(isValidSlug(s)).toBe(true));
    ["", "-bad", "bad-", "Bad", "a b", "a/b", "a--b", "../x", null, undefined, 5].forEach((s) => {
      expect(isValidSlug(s)).toBe(false);
    });
  });
});

describe("validateArticleFields", () => {
  it("accepts good fields", () => {
    expect(validateArticleFields(good)).toBeNull();
  });

  it("rejects a short or long title, summary and text", () => {
    expect(validateArticleFields(Object.assign({}, good, { title: "abc" }))).toMatch(/title/i);
    expect(validateArticleFields(Object.assign({}, good, { title: "x".repeat(121) }))).toMatch(/title/i);
    expect(validateArticleFields(Object.assign({}, good, { summary: "short" }))).toMatch(/summary/i);
    expect(validateArticleFields(Object.assign({}, good, { body: "short" }))).toMatch(/article text/i);
    expect(validateArticleFields(Object.assign({}, good, { body: "x".repeat(8001) }))).toMatch(/too long/i);
  });

  it("rejects angle brackets and an unknown category", () => {
    expect(validateArticleFields(Object.assign({}, good, { title: "A <b>bold</b> title" }))).toMatch(/< or >/);
    expect(validateArticleFields(Object.assign({}, good, { body: "x".repeat(60) + " <script>" }))).toMatch(/< or >/);
    expect(validateArticleFields(Object.assign({}, good, { category: "HACKED" }))).toMatch(/category/i);
    expect(validateArticleFields(Object.assign({}, good, { category: undefined }))).toMatch(/category/i);
  });
});
