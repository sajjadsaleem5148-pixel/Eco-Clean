import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { unreadCountFor } from "@/services/notificationCount";
import { notificationsPathFor, formatBadgeCount } from "@/lib/notificationLinks";

export default async function NotificationBell() {
  // The id and role come from the server session, never from the URL.
  const user = await getCurrentUser();
  if (!user) return null;
  const href = notificationsPathFor(user.role);
  if (!href) return null;

  const count = await unreadCountFor(user.id);
  const badge = formatBadgeCount(count);
  const label = badge ? "Notifications, " + badge + " unread" : "Notifications";

  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-emerald-300 px-2 text-white hover:bg-emerald-900"
    >
      <Bell size={20} aria-hidden="true" />
      {badge && (
        <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-emerald-950">{badge}</span>
      )}
    </Link>
  );
}
