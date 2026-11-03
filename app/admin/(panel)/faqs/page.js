import connectDB from "@/lib/db/connect";
import FAQ from "@/models/FAQ";
import { requirePermission } from "@/lib/auth/guards";
import { CONTENT_STATUS_LABELS, CONTENT_TARGET_LABELS, contentTargets } from "@/lib/contentStatus";
import { FaqForm, ContentStatusButton } from "@/components/forms/ContentForms";

export const metadata = { title: "FAQs | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminFaqsPage() {
  await requirePermission("content.publish");

  let faqs = [];
  let loadError = false;
  try {
    await connectDB();
    faqs = await FAQ.find({ deletedAt: null }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load FAQs failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">FAQs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Published FAQs appear at the bottom of the public Services page.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            FAQs could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && faqs.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No FAQs yet. Create the first one below.
          </p>
        )}

        {faqs.length > 0 && (
          <ul className="mt-4 space-y-3">
            {faqs.map((f) => (
              <li key={f._id.toString()} className="rounded-md border border-gray-200 p-4">
                <p className="font-semibold">{f.question}</p>
                <p className="mt-1 text-sm text-gray-700">{f.answer}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Status: {CONTENT_STATUS_LABELS[f.status] || f.status} | Order: {f.sortOrder}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contentTargets(f.status).map((t) => (
                    <ContentStatusButton
                      key={t}
                      kind="faq"
                      id={f._id.toString()}
                      target={t}
                      label={CONTENT_TARGET_LABELS[t]}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a FAQ</h2>
        <FaqForm />
      </section>
    </div>
  );
}
