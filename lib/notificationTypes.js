export const NOTIFICATION_TYPES = ["REPORT", "JOB", "COMPLAINT", "POINTS", "ORDER", "SYSTEM"];

export const NOTIFICATION_TYPE_LABELS = {
  REPORT: "Report",
  JOB: "Job",
  COMPLAINT: "Complaint",
  POINTS: "Green Points",
  ORDER: "Reward order",
  SYSTEM: "System",
};

// Only a path inside this site is allowed. Full URLs, protocol-relative links and javascript: are dropped.
export function safeLink(link) {
  if (typeof link !== "string") return undefined;
  if (link.startsWith("//")) return undefined;
  if (!/^[/][A-Za-z0-9/_.?=&-]{0,198}$/.test(link)) return undefined;
  return link;
}

export function clip(text, max) {
  const value = String(text == null ? "" : text);
  return value.length > max ? value.slice(0, max) : value;
}
