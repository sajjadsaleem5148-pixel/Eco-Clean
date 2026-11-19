import { describe, it, expect } from "vitest";
import {
  VEHICLE_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABELS,
  VEHICLE_STATUS_FROM,
  VEHICLE_REASON_REQUIRED,
  VEHICLE_BADGE,
  vehicleTargets,
  normalizePlate,
  isValidPlate,
  plateKeyOf,
} from "@/lib/vehicleRules";

describe("vehicle status", () => {
  it("has a label and a badge for every status", () => {
    VEHICLE_STATUSES.forEach((s) => {
      expect(VEHICLE_STATUS_LABELS[s]).toBeTruthy();
      expect(VEHICLE_BADGE[s]).toBeTruthy();
    });
  });

  it("only refers to real statuses", () => {
    Object.entries(VEHICLE_STATUS_FROM).forEach(([to, froms]) => {
      expect(VEHICLE_STATUSES).toContain(to);
      froms.forEach((f) => expect(VEHICLE_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps and never lets a retired vehicle return", () => {
    expect(vehicleTargets("ACTIVE")).toEqual(["MAINTENANCE", "RETIRED"]);
    expect(vehicleTargets("MAINTENANCE")).toEqual(["ACTIVE", "RETIRED"]);
    expect(vehicleTargets("RETIRED")).toEqual([]);
    expect(vehicleTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason for maintenance and retirement only", () => {
    expect(VEHICLE_REASON_REQUIRED).toEqual(["MAINTENANCE", "RETIRED"]);
  });

  it("has five vehicle types", () => {
    expect(Object.keys(VEHICLE_TYPES)).toHaveLength(5);
  });
});

describe("plate numbers", () => {
  it("normalises case and spacing", () => {
    expect(normalizePlate("  abc   123 ")).toBe("ABC 123");
    expect(normalizePlate(null)).toBe("");
  });

  it("accepts normal plates and rejects odd ones", () => {
    ["ABC 123", "abc-123", "KHI 4567", "LEA-21-1234"].forEach((p) => expect(isValidPlate(p)).toBe(true));
    ["", "ab", "-ABC", "ABC<123>", "A".repeat(16), "ABC;DROP"].forEach((p) => expect(isValidPlate(p)).toBe(false));
  });

  it("treats different spellings of one plate as the same key", () => {
    expect(plateKeyOf("abc 123")).toBe("ABC123");
    expect(plateKeyOf("ABC-123")).toBe("ABC123");
    expect(plateKeyOf("abc123")).toBe("ABC123");
    expect(plateKeyOf("ABC 124")).not.toBe(plateKeyOf("ABC 123"));
  });
});
