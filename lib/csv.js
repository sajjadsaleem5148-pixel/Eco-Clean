// Turns one value into one safe CSV cell.
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  // A cell that starts with one of these characters can run as a formula in Excel or Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
  return text;
}

// columns: [{ key, label }]   rows: [{ [key]: value }]
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}
