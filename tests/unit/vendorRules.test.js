import { describe, it, expect } from "vitest";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_FROM,
  VENDOR_REASON_REQUIRED,
  PHONE_PATTERN,
  vendorTargets,
  vendorTargetLabel,
  isPlainEmail,
  normalizeName,
  nameKeyOf,
  hasContact,
} from "@/lib/vendorRules";

describe("vendor status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    VENDOR_STATUSES.forEach((s) => expect(VENDOR_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(VENDOR_STATUS_FROM).forEach(([to, froms]) => {
      expect(VENDOR_STATUSES).toContain(to);
      froms.forEach((f) => expect(VENDOR_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(vendorTargets("PENDING")).toEqual(["APPROVED", "INACTIVE"]);
    expect(vendorTargets("APPROVED")).toEqual(["INACTIVE"]);
    expect(vendorTargets("INACTIVE")).toEqual(["APPROVED"]);
    expect(vendorTargets("MADE_UP")).toEqual([]);
  });

  it("names the approve and reactivate buttons differently", () => {
    expect(vendorTargetLabel("PENDING", "APPROVED")).toBe("Approve vendor");
    expect(vendorTargetLabel("INACTIVE", "APPROVED")).toBe("Reactivate vendor");
    expect(vendorTargetLabel("APPROVED", "INACTIVE")).toBe("Deactivate vendor");
  });

  it("requires a reason only to deactivate", () => {
    expect(VENDOR_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });

  it("does not offer fresh produce as a category", () => {
    expect(Object.keys(VENDOR_CATEGORIES).join(" ").toLowerCase().includes("produce")).toBe(false);
    expect(Object.values(VENDOR_CATEGORIES).join(" ").toLowerCase().includes("produce")).toBe(false);
  });
});

describe("names", () => {
  it("normalises spacing", () => {
    expect(normalizeName("  Green   Gardens  ")).toBe("Green Gardens");
    expect(normalizeName(null)).toBe("");
  });

  it("treats different spellings of one name as the same key", () => {
    expect(nameKeyOf("Green Gardens Ltd")).toBe("greengardensltd");
    expect(nameKeyOf("green-gardens  LTD.")).toBe("greengardensltd");
    expect(nameKeyOf("Green Gardens Ltd 2")).not.toBe(nameKeyOf("Green Gardens Ltd"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});

describe("contact details", () => {
  it("accepts normal emails and rejects odd ones", () => {
    expect(isPlainEmail("sales@example.com")).toBe(true);
    ["", "no-at-sign", "a@b", "a b@example.com", "<x>@example.com", null].forEach((v) => {
      expect(isPlainEmail(v)).toBe(false);
    });
  });

  it("accepts normal phone numbers and rejects letters", () => {
    ["+92 21 1234567", "(021) 123-4567"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(true));
    ["call me", "12", "<script>"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(false));
  });

  it("needs an email or a phone number to count as having contact details", () => {
    expect(hasContact({ email: "a@b.co", phone: "" })).toBe(true);
    expect(hasContact({ email: "", phone: "+92 21 1234567" })).toBe(true);
    expect(hasContact({ email: "", phone: "" })).toBe(false);
    expect(hasContact({})).toBe(false);
    expect(hasContact(null)).toBe(false);
  });
});
