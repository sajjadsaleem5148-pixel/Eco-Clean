import { requirePermission } from "@/lib/auth/guards";
import { getSupportOverview } from "@/services/supportOverview";
import { hoursText } from "@/lib/supportOverview";
import StatCard from "@/components/dashboard/StatCard";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Support Overview | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requirePermission("complaints.resolve");

  let data = null;
  let loadError = false;
  try {
    data = await getSupportOverview();
  } catch (err) {
    console.error("Load support overview failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Support Overview</h1>
        <p className="mt-1 text-sm text-gray-600">
          Live counts of complaints and contact messages. This page is read-only and shows no names, emails or message
          text. Open the linked pages to work on a case.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Support data could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
      </section>

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Complaints</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Open complaints" value={data.openComplaints} href="/admin/complaints" />
              <StatCard label="Escalated" value={data.escalated} href="/admin/complaints?status=ESCALATED" />
              <StatCard label="High priority (open)" value={data.highPriority} href="/admin/complaints" />
              <StatCard label="Open and not assigned" value={data.unassigned} href="/admin/complaints" />
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Contact messages</h2>
            <ul className="grid gap-4 sm:grid-cols-3">
              <StatCard label="New messages" value={data.newMessages} href="/admin/contact-messages?status=NEW" />
              <StatCard
                label="In progress"
                value={data.messagesInProgress}
                href="/admin/contact-messages?status=IN_PROGRESS"
              />
              <StatCard
                label="Oldest new message has waited"
                value={hoursText(data.oldestNewMessageHours)}
                href="/admin/contact-messages?status=NEW"
              />
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
