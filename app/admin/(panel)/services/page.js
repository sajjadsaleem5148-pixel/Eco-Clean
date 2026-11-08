import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import {
  SERVICE_CATEGORIES,
  ELIGIBLE_LABELS,
  CONTENT_STATUS_LABELS,
  CONTENT_TARGET_LABELS,
  contentTargets,
} from "@/lib/contentStatus";
import { ServiceForm, ContentStatusButton } from "@/components/forms/ContentForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Services | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requirePermission("content.publish");

  let services = [];
  let loadError = false;
  try {
    await connectDB();
    services = await Service.find({ deletedAt: null })
      .sort({ createdAt: -1 })
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load services failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(SERVICE_CATEGORIES).map(([value, label]) => ({ value, label }));
  const eligibles = Object.entries(ELIGIBLE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Services</h1>
        <p className="mt-1 text-sm text-gray-600">
          New services start as drafts. Only published services appear on the public Services page.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Services could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && services.length === 0 && (
          <div className="mt-4">
            <EmptyState>No services yet. Create the first one below.</EmptyState>
          </div>
        )}

        {services.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Title</th>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Eligible</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Published by</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{s.title}</td>
                    <td className="py-2 pr-4">{SERVICE_CATEGORIES[s.category] || s.category}</td>
                    <td className="py-2 pr-4">{ELIGIBLE_LABELS[s.eligibleCustomer]}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={s.status} label={CONTENT_STATUS_LABELS[s.status]} />
                    </td>
                    <td className="py-2 pr-4">{s.publishedBy ? s.publishedBy.name : "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {contentTargets(s.status).map((t) => (
                          <ContentStatusButton
                            key={t}
                            kind="service"
                            id={s._id.toString()}
                            target={t}
                            label={CONTENT_TARGET_LABELS[t]}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a service</h2>
        <ServiceForm categories={categories} eligibles={eligibles} />
      </section>
    </div>
  );
}
