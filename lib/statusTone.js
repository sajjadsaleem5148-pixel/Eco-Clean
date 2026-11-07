// Decides the colour group of a status. Pure logic, no UI.
const TONES = {
  success: [
    "COLLECTED", "COMPLETED", "RESOLVED", "PUBLISHED", "ACTIVE", "VERIFIED",
    "RESPONDED", "APPROVED", "READY_FOR_COLLECTION",
  ],
  danger: ["REJECTED", "CANCELLED", "UNABLE_TO_COLLECT", "SUSPENDED", "ARCHIVED"],
  warning: ["ESCALATED", "PENDING", "UNDER_REVIEW", "ON_THE_WAY", "ARRIVED"],
  info: [
    "SUBMITTED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "PREPARING",
    "DISPATCHED", "NEW", "DRAFT",
  ],
};

export function toneFor(status) {
  if (!status) return "neutral";
  const key = String(status);
  for (const tone of Object.keys(TONES)) {
    if (TONES[tone].includes(key)) return tone;
  }
  return "neutral";
}
