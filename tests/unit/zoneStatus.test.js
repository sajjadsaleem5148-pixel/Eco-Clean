import { describe, it, expect } from "vitest";
import {
  ZONE_STATUSES,
  ZONE_STATUS_LABELS,
  ZONE_STATUS_FROM,
  ZONE_REASON_REQUIRED,
  zoneTargets,
} from "@/lib/zoneStatus";

describe("zone status", () => {
  it("has a label for every status", () => {
    ZONE_STATUSES.forEach((s) => expect(ZONE_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses", () => {
    Object.entries(ZONE_STATUS_FROM).forEach(([to, froms]) => {
      expect(ZONE_STATUSES).toContain(to);
      froms.forEach((f) => expect(ZONE_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active zone and reactivate on an inactive zone", () => {
    expect(zoneTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(zoneTargets("INACTIVE")).toEqual(["ACTIVE"]);
  });

  it("offers nothing for an unknown status", () => {
    expect(zoneTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(ZONE_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});
