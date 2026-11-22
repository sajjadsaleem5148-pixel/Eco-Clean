import { describe, it, expect } from "vitest";
import {
  ROUTE_STATUSES,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_FROM,
  ROUTE_REASON_REQUIRED,
  MIN_STOPS_TO_ACTIVATE,
  MAX_STOPS,
  routeTargets,
  routeTargetLabel,
  normalizeName,
  nameKeyOf,
  parseStops,
} from "@/lib/routeRules";

describe("route status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    ROUTE_STATUSES.forEach((s) => expect(ROUTE_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(ROUTE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ROUTE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ROUTE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps and never goes back to draft", () => {
    expect(routeTargets("DRAFT")).toEqual(["ACTIVE", "INACTIVE"]);
    expect(routeTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(routeTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(routeTargets("MADE_UP")).toEqual([]);
    expect(ROUTE_STATUS_FROM.DRAFT).toBeUndefined();
  });

  it("names the activate and reactivate buttons differently", () => {
    expect(routeTargetLabel("DRAFT", "ACTIVE")).toBe("Activate route");
    expect(routeTargetLabel("INACTIVE", "ACTIVE")).toBe("Reactivate route");
    expect(routeTargetLabel("ACTIVE", "INACTIVE")).toBe("Deactivate route");
  });

  it("requires a reason only to deactivate and two stops to activate", () => {
    expect(ROUTE_REASON_REQUIRED).toEqual(["INACTIVE"]);
    expect(MIN_STOPS_TO_ACTIVATE).toBe(2);
  });
});

describe("names", () => {
  it("normalises spacing and treats spellings of one name as the same key", () => {
    expect(normalizeName("  North   Loop ")).toBe("North Loop");
    expect(nameKeyOf("North Loop")).toBe("northloop");
    expect(nameKeyOf("north-loop.")).toBe("northloop");
    expect(nameKeyOf("North Loop 2")).not.toBe(nameKeyOf("North Loop"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});

describe("parseStops", () => {
  it("keeps the order, trims lines, drops blanks and repeats", () => {
    const r = parseStops("  Main Street \n\n Park Road\r\nmain  street\nMarket Square");
    expect(r.items).toEqual(["Main Street", "Park Road", "Market Square"]);
  });

  it("returns an empty list for empty or missing text", () => {
    expect(parseStops("").items).toEqual([]);
    expect(parseStops(null).items).toEqual([]);
  });

  it("rejects too many stops and stops that are too long", () => {
    const many = Array.from({ length: MAX_STOPS + 1 }, (_, i) => "Stop " + i).join("\n");
    expect(parseStops(many).error).toMatch(/40/);
    expect(parseStops("x".repeat(101)).error).toMatch(/100/);
    expect(parseStops("x".repeat(100)).items).toHaveLength(1);
    expect(parseStops(Array.from({ length: MAX_STOPS }, (_, i) => "Stop " + i).join("\n")).items).toHaveLength(MAX_STOPS);
  });
});
