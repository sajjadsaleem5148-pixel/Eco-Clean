import { listPublicTestimonials } from "@/services/testimonials";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Testimonials | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function TestimonialsPage() {
  let items = [];
  let loadError = false;
  try {
    items = await listPublicTestimonials();
  } catch (err) {
    console.error("Load public testimonials failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">What people say</h1>
      <p className="mt-2 text-sm text-gray-700">
        Words from community members who agreed to be quoted.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Testimonials are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState>No testimonials have been published yet.</EmptyState>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-6 space-y-4">
          {items.map((t) => (
            <li key={t.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <blockquote className="text-sm leading-6 text-gray-800">{t.quote}</blockquote>
              <p className="mt-3 text-sm font-semibold text-emerald-900">
                {t.authorName}
                {t.authorDetail ? <span className="font-normal text-gray-600">, {t.authorDetail}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
