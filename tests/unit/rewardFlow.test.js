import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABELS,
  STAFF_ORDER_STATUSES,
  REASON_REQUIRED_ORDER,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_FROM,
  nextOrderStatuses,
  productTargets,
} from "@/lib/rewardStatus";

describe("order statuses", () => {
  it("has eight statuses, each with a label", () => {
    expect(ORDER_STATUSES).toHaveLength(8);
    ORDER_STATUSES.forEach((s) => expect(ORDER_STATUS_LABELS[s]).toBeTruthy());
  });

  it("only refers to real statuses in the transition table", () => {
    Object.entries(ORDER_TRANSITIONS).forEach(([from, targets]) => {
      expect(ORDER_STATUSES).toContain(from);
      targets.forEach((t) => expect(ORDER_STATUSES).toContain(t));
    });
  });

  it("has no way out of a finished order", () => {
    ["COMPLETED", "REJECTED", "CANCELLED"].forEach((s) => {
      expect(ORDER_TRANSITIONS[s]).toBeUndefined();
      expect(nextOrderStatuses(s, "PICKUP")).toEqual([]);
      expect(nextOrderStatuses(s, "DISPATCH")).toEqual([]);
    });
  });

  it("never lets staff set Pending", () => {
    expect(STAFF_ORDER_STATUSES).not.toContain("PENDING");
  });

  it("requires a reason for Rejected and Cancelled", () => {
    expect(REASON_REQUIRED_ORDER).toEqual(["REJECTED", "CANCELLED"]);
  });
});

describe("nextOrderStatuses", () => {
  it("lets a pending order be approved, rejected or cancelled", () => {
    expect(nextOrderStatuses("PENDING", "PICKUP")).toEqual(["APPROVED", "REJECTED", "CANCELLED"]);
  });

  it("does not let a pending order jump to Completed", () => {
    expect(nextOrderStatuses("PENDING", "PICKUP")).not.toContain("COMPLETED");
    expect(nextOrderStatuses("PENDING", "DISPATCH")).not.toContain("COMPLETED");
  });

  it("uses Ready for Collection only for pickup orders", () => {
    expect(nextOrderStatuses("PREPARING", "PICKUP")).toEqual(["READY_FOR_COLLECTION", "CANCELLED"]);
  });

  it("uses Dispatched only for dispatch orders", () => {
    expect(nextOrderStatuses("PREPARING", "DISPATCH")).toEqual(["DISPATCHED", "CANCELLED"]);
  });

  it("cannot cancel an order that was already dispatched", () => {
    expect(nextOrderStatuses("DISPATCHED", "DISPATCH")).toEqual(["COMPLETED"]);
  });

  it("completes a ready pickup order", () => {
    expect(nextOrderStatuses("READY_FOR_COLLECTION", "PICKUP")).toEqual(["COMPLETED", "CANCELLED"]);
  });

  it("returns nothing for an unknown status", () => {
    expect(nextOrderStatuses("MADE_UP", "PICKUP")).toEqual([]);
  });
});

describe("product status", () => {
  it("only refers to real statuses", () => {
    Object.entries(PRODUCT_STATUS_FROM).forEach(([to, froms]) => {
      expect(PRODUCT_STATUSES).toContain(to);
      froms.forEach((f) => expect(PRODUCT_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(productTargets("DRAFT")).toEqual(["PUBLISHED", "ARCHIVED"]);
    expect(productTargets("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(productTargets("ARCHIVED")).toEqual(["DRAFT"]);
  });
});
