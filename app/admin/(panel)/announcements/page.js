import connectDB from "@/lib/db/connect";
import Announcement from "@/models/Announcement";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ANN_STATUS_LABELS, ANN_TARGET_LABELS, annTargets } from "@/lib/pageKeys";
import { AnnouncementForm, AnnouncementStatusButton } from "@/components/forms/PageForms";

export const metadata = { title: "Announcements | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requirePermission("content.publish");

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Announcement.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load announcements failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
        <p className="mt-1 text-sm text-gray-600">
          The two most recently published announcements appear as a banner at the top of every public page.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Announcements could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && items.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No announcements yet. Create the first one below.
          </p>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((a) => (
              <li key={a._id.toString()} className="rounded-md border border-gray-200 p-4">
                <p className="font-semibold">{a.title}</p>
                <p className="mt-1 text-sm text-gray-700">{a.body}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Status: {ANN_STATUS_LABELS[a.status] || a.status}
                  {a.publishedAt ? " | Published " + formatDateTime(a.publishedAt) : ""}
                  {a.publishedBy ? " by " + a.publishedBy.name : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {annTargets(a.status).map((t) => (
                    <AnnouncementStatusButton
                      key={t}
                      id={a._id.toString()}
                      target={t}
                      label={ANN_TARGET_LABELS[t]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create an announcement</h2>
        <AnnouncementForm />
      </section>
    </div>
  );
}
