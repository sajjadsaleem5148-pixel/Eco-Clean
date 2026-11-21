const HOUR_MS = 60 * 60 * 1000;

// Whole hours since a date. Returns null when the date is missing or not valid.
export function waitingHours(date, now) {
  if (!date) return null;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return null;
  const current = (now || new Date()).getTime();
  return Math.max(0, Math.floor((current - then.getTime()) / HOUR_MS));
}

export function hoursText(hours) {
  return hours === null || hours === undefined ? null : hours + " h";
}
