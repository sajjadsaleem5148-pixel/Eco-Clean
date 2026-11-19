import { describe, it, expect } from "vitest";
import {
  NEIGHBORHOOD_STATUSES,
  NEIGHBORHOOD_STATUS_LABELS,
  NEIGHBORHOOD_STATUS_FROM,
  NEIGHBORHOOD_REASON_REQUIRED,
  neighborhoodTargets,
  normalizeName,
  nameKeyOf,
} from "@/lib/neighborhoodRules";

describe("neighborhood status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    NEIGHBORHOOD_STATUSES.forEach((s) => expect(NEIGHBORHOOD_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(NEIGHBORHOOD_STATUS_FROM).forEach(([to, froms]) => {
      expect(NEIGHBORHOOD_STATUSES).toContain(to);
      froms.forEach((f) => expect(NEIGHBORHOOD_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active neighborhood and reactivate on an inactive one", () => {
    expect(neighborhoodTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(neighborhoodTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(neighborhoodTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(NEIGHBORHOOD_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});

describe("names", () => {
  it("normalises spacing", () => {
    expect(normalizeName("  North   Block ")).toBe("North Block");
    expect(normalizeName(null)).toBe("");
  });

  it("treats different spellings of one name as the same key", () => {
    expect(nameKeyOf("North Block")).toBe("northblock");
    expect(nameKeyOf("north-block")).toBe("northblock");
    expect(nameKeyOf("  NORTH   BLOCK. ")).toBe("northblock");
    expect(nameKeyOf("North Block 2")).not.toBe(nameKeyOf("North Block"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});
