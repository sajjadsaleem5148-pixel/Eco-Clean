import { describe, it, expect } from "vitest";
import { NAME_MIN, NAME_MAX, normalizeDisplayName, isValidDisplayName } from "@/lib/profileRules";

describe("normalizeDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeDisplayName("  Ayesha    Khan ")).toBe("Ayesha Khan");
    expect(normalizeDisplayName(null)).toBe("");
    expect(normalizeDisplayName(undefined)).toBe("");
  });
});

describe("isValidDisplayName", () => {
  it("accepts normal names, including non-English ones", () => {
    expect(NAME_MIN).toBe(2);
    expect(NAME_MAX).toBe(120);
    ["Ayesha Khan", "Al", "Jean-Luc O'Neil", "Resident 42"].forEach((n) => expect(isValidDisplayName(n)).toBe(true));
    expect(isValidDisplayName("عائشہ خان")).toBe(true);
    expect(isValidDisplayName("x".repeat(120))).toBe(true);
  });

  it("rejects empty, too short and too long names", () => {
    ["", "   ", "a", null, undefined].forEach((n) => expect(isValidDisplayName(n)).toBe(false));
    expect(isValidDisplayName("x".repeat(121))).toBe(false);
  });

  it("rejects names without a letter or number", () => {
    ["!!!", "--", "...", "@#$"].forEach((n) => expect(isValidDisplayName(n)).toBe(false));
  });

  it("rejects angle brackets and control characters", () => {
    expect(isValidDisplayName("<b>Bob</b>")).toBe(false);
    expect(isValidDisplayName("Bad\u0007Name")).toBe(false);
  });
});
