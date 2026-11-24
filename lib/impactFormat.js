// A whole number with thousands separators. Anything that is not a real count shows as a dash.
export function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-";
  return Math.floor(value).toLocaleString("en-US");
}

export function isAllZero(figures) {
  if (!figures) return false;
  const values = Object.keys(figures).map((k) => figures[k]);
  return values.length > 0 && values.every((v) => v === 0);
}
