const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const d = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return d;
}

// Both dates are inclusive UTC days. Without dates the range is the last 30 days.
export function parseRange(fromValue, toValue, now) {
  const current = now || new Date();
  const toStr = toValue ? toValue : current.toISOString().slice(0, 10);
  const to = parseDay(toStr);
  if (!to) return { error: "The end date is not a valid date. Use YYYY-MM-DD." };

  const fromStr = fromValue ? fromValue : new Date(to.getTime() - 29 * DAY_MS).toISOString().slice(0, 10);
  const from = parseDay(fromStr);
  if (!from) return { error: "The start date is not a valid date. Use YYYY-MM-DD." };

  if (from.getTime() > to.getTime()) return { error: "The start date must not be after the end date." };

  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    return { error: "The date range is too long. The maximum is " + MAX_RANGE_DAYS + " days." };
  }

  return { fromStr, toStr, from, toExclusive: new Date(to.getTime() + DAY_MS), days };
}
