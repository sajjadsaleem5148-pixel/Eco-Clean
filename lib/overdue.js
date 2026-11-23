// A report counts as overdue when it was verified, is still not collected, and more time has passed
// than the zone's collection target allows. This is an estimate, not a confirmed missed pickup.
export const OVERDUE_STATUSES = ["VERIFIED", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function verifiedAtOf(history) {
  if (!Array.isArray(history)) return null;
  const entry = history.find((h) => h && h.status === "VERIFIED" && h.at);
  if (!entry) return null;
  const date = new Date(entry.at);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Returns null when the report is not overdue.
export function overdueInfo(report, zoneDays, now) {
  const current = now || new Date();
  if (!report || !OVERDUE_STATUSES.includes(report.status)) return null;
  if (typeof zoneDays !== "number" || !(zoneDays >= 1)) return null;
  const verifiedAt = verifiedAtOf(report.statusHistory);
  if (!verifiedAt) return null;

  const dueAt = new Date(verifiedAt.getTime() + zoneDays * DAY_MS);
  if (current.getTime() <= dueAt.getTime()) return null;

  return {
    verifiedAt: verifiedAt,
    dueAt: dueAt,
    hoursLate: Math.floor((current.getTime() - dueAt.getTime()) / HOUR_MS),
  };
}
