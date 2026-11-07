import { describe, it, expect } from "vitest";
import { toneFor } from "@/lib/statusTone";

describe("toneFor", () => {
  it("marks finished good outcomes as success", () => {
    ["COLLECTED", "COMPLETED", "RESOLVED", "PUBLISHED"].forEach((s) => {
      expect(toneFor(s)).toBe("success");
    });
  });

  it("marks failures and removals as danger", () => {
    ["REJECTED", "CANCELLED", "UNABLE_TO_COLLECT", "SUSPENDED"].forEach((s) => {
      expect(toneFor(s)).toBe("danger");
    });
  });

  it("marks things that need attention as warning", () => {
    expect(toneFor("ESCALATED")).toBe("warning");
    expect(toneFor("PENDING")).toBe("warning");
  });

  it("marks work in progress as info", () => {
    expect(toneFor("SUBMITTED")).toBe("info");
    expect(toneFor("ASSIGNED")).toBe("info");
  });

  it("falls back to neutral for unknown or missing values", () => {
    expect(toneFor("SOMETHING_ELSE")).toBe("neutral");
    expect(toneFor(undefined)).toBe("neutral");
    expect(toneFor(null)).toBe("neutral");
    expect(toneFor("")).toBe("neutral");
  });
});
