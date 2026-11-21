// Statuses of a job that a collector currently holds.
export const ACTIVE_JOB_STATUSES = ["ASSIGNED", "ACCEPTED", "ON_THE_WAY", "ARRIVED"];

const HOUR_MS = 60 * 60 * 1000;

// Whole hours since a date. Returns null when the date is missing or not valid.
export function hoursSince(date, now) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const current = (now || new Date()).getTime();
  return Math.max(0, Math.floor((current - then.getTime()) / HOUR_MS));
}

// items: [{ collectorId, collectorName, status }]. Jobs without a collector id are skipped.
// Result: one row per collector, the busiest first, then by name.
export function summarizeByCollector(items) {
  const rows = {};
  (items || []).forEach((item) => {
    if (!item || !item.collectorId) return;
    if (!ACTIVE_JOB_STATUSES.includes(item.status)) return;
    if (!rows[item.collectorId]) {
      rows[item.collectorId] = {
        collectorId: item.collectorId,
        name: item.collectorName || "Unknown collector",
        total: 0,
        ASSIGNED: 0,
        ACCEPTED: 0,
        ON_THE_WAY: 0,
        ARRIVED: 0,
      };
    }
    rows[item.collectorId][item.status] += 1;
    rows[item.collectorId].total += 1;
  });
  return Object.values(rows).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
