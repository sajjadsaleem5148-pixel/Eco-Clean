import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("prefixes cells that could run as formulas", () => {
    ["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\tTabbed", "\rReturn"].forEach((v) => {
      expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
    });
  });

  it("keeps real numbers, including negative ones, as numbers", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell(NaN)).toBe("");
  });

  it("writes missing values as empty cells", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells with commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("applies both protections together", () => {
    expect(csvCell("=1,2")).toBe('"' + "'=1,2" + '"');
  });

  it("leaves plain text alone", () => {
    expect(csvCell("COLLECTED")).toBe("COLLECTED");
  });
});

describe("toCsv", () => {
  const columns = [
    { key: "status", label: "Status" },
    { key: "count", label: "Reports" },
  ];

  it("writes a header and one line per row", () => {
    const csv = toCsv(columns, [{ status: "COLLECTED", count: 2 }, { status: "=BAD()", count: 1 }]);
    expect(csv).toBe("Status,Reports\r\nCOLLECTED,2\r\n'=BAD(),1\r\n");
  });

  it("writes only the header when there are no rows", () => {
    expect(toCsv(columns, [])).toBe("Status,Reports\r\n");
  });
});
