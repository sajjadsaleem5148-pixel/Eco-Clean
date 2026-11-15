import { requireRole } from "@/lib/auth/guards";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentNotificationsPage({ searchParams }) {
  const user = await requireRole(["RESIDENT"]);
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/dashboard/notifications" sp={sp} />;
}
