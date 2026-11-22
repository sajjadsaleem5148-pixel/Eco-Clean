import { ADMIN_ROLES } from "@/lib/permissions/roles";

// Where each role reads its notifications. Returns null for a role that has no notifications page.
export function notificationsPathFor(role) {
  if (role === "RESIDENT") return "/dashboard/notifications";
  if (role === "COLLECTOR") return "/collector/notifications";
  if (ADMIN_ROLES.includes(role)) return "/admin/notifications";
  return null;
}

// Text shown next to the bell. Empty when there is nothing to show.
export function formatBadgeCount(count) {
  if (typeof count !== "number" || !Number.isFinite(count)) return "";
  const n = Math.floor(count);
  if (!(n > 0)) return "";
  return n > 99 ? "99+" : String(n);
}
