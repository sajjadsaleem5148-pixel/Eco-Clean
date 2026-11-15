import { describe, it, expect } from "vitest";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";

describe("export datasets", () => {
  it("describes every dataset", () => {
    expect(DATASET_KEYS.length).toBeGreaterThan(0);
    DATASET_KEYS.forEach((k) => {
      const d = DATASETS[k];
      expect(d.label).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.columns.length).toBeGreaterThan(0);
      d.columns.forEach((c) => {
        expect(c.key).toBeTruthy();
        expect(c.label).toBeTruthy();
      });
    });
  });

  it("never offers a personal-data column", () => {
    DATASET_KEYS.forEach((k) => {
      DATASETS[k].columns.forEach((c) => {
        expect(/email|name|phone|address/i.test(c.key + " " + c.label)).toBe(false);
      });
    });
  });

  it("applies the zone filter only where records have a zone", () => {
    expect(DATASETS["reports-by-status"].zone).toBe(true);
    expect(DATASETS["reports-by-day"].zone).toBe(true);
    expect(DATASETS["complaints-by-status"].zone).toBe(true);
    expect(DATASETS["points-by-type"].zone).toBe(false);
    expect(DATASETS["orders-by-status"].zone).toBe(false);
  });
});
