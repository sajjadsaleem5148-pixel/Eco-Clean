import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }) {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/admin/notifications" sp={sp} />;
}
