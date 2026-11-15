import { requireRole } from "@/lib/auth/guards";
import NotificationCenter from "@/components/dashboard/NotificationCenter";

export const metadata = { title: "Notifications | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CollectorNotificationsPage({ searchParams }) {
  const user = await requireRole(["COLLECTOR"]);
  const sp = await searchParams;
  return <NotificationCenter userId={user.id} basePath="/collector/notifications" sp={sp} />;
}
