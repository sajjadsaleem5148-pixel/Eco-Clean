import { describe, it, expect } from "vitest";
import {
  CATEGORY_STATUSES,
  CATEGORY_STATUS_LABELS,
  CATEGORY_STATUS_FROM,
  CATEGORY_REASON_REQUIRED,
  MAX_MATERIALS,
  categoryTargets,
  isHexColor,
  safeColor,
  textColorFor,
  parseMaterials,
  makeCategoryKey,
} from "@/lib/categoryRules";

describe("category status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    CATEGORY_STATUSES.forEach((s) => expect(CATEGORY_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(CATEGORY_STATUS_FROM).forEach(([to, froms]) => {
      expect(CATEGORY_STATUSES).toContain(to);
      froms.forEach((f) => expect(CATEGORY_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active category and reactivate on an inactive one", () => {
    expect(categoryTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(categoryTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(categoryTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(CATEGORY_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});

describe("colours", () => {
  it("accepts only six-digit hex colours", () => {
    ["#047857", "#ABCDEF", "#000000"].forEach((v) => expect(isHexColor(v)).toBe(true));
    ["red", "#12345", "#1234567", "047857", "url(x)", "javascript:alert(1)", "", null, undefined, 5].forEach((v) => {
      expect(isHexColor(v)).toBe(false);
    });
  });

  it("falls back to a safe colour for bad stored values", () => {
    expect(safeColor("#ABCDEF")).toBe("#abcdef");
    expect(safeColor("red; background:url(x)")).toBe("#4b5563");
    expect(safeColor(undefined)).toBe("#4b5563");
  });

  it("picks readable text for dark and light backgrounds", () => {
    expect(textColorFor("#047857")).toBe("#ffffff");
    expect(textColorFor("#000000")).toBe("#ffffff");
    expect(textColorFor("#ffffff")).toBe("#111111");
    expect(textColorFor("#facc15")).toBe("#111111");
    expect(textColorFor("not-a-colour")).toBe("#ffffff");
  });
});

describe("parseMaterials", () => {
  it("trims lines, drops blanks and repeats, and keeps the first spelling", () => {
    const r = parseMaterials("  Leaves \n\n Grass cuttings\r\nleaves\n");
    expect(r.items).toEqual(["Leaves", "Grass cuttings"]);
  });

  it("returns an empty list for empty or missing text", () => {
    expect(parseMaterials("").items).toEqual([]);
    expect(parseMaterials(null).items).toEqual([]);
  });

  it("rejects too many items and items that are too long", () => {
    const many = Array.from({ length: MAX_MATERIALS + 1 }, (_, i) => "Item " + i).join("\n");
    expect(parseMaterials(many).error).toBeTruthy();
    expect(parseMaterials("x".repeat(101)).error).toBeTruthy();
    expect(parseMaterials("x".repeat(100)).items).toHaveLength(1);
  });
});

describe("makeCategoryKey", () => {
  it("makes a short lowercase key from the name", () => {
    expect(makeCategoryKey("Garden Waste")).toBe("garden-waste");
    expect(makeCategoryKey("  Glass & Metal!! ")).toBe("glass-metal");
    expect(makeCategoryKey("!!!")).toBe("");
    expect(makeCategoryKey("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});
