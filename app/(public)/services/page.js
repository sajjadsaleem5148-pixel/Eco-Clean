import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import FAQ from "@/models/FAQ";
import { SERVICE_CATEGORIES, ELIGIBLE_LABELS } from "@/lib/contentStatus";

export const metadata = { title: "Services | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  let services = [];
  let faqs = [];
  let loadError = false;
  try {
    await connectDB();
    [services, faqs] = await Promise.all([
      Service.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ title: 1 })
        .select("title slug category eligibleCustomer")
        .lean(),
      FAQ.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ sortOrder: 1, createdAt: 1 })
        .select("question answer")
        .lean(),
    ]);
  } catch (err) {
    console.error("Load services failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Services</h1>
      <p className="mt-2 text-sm text-gray-700">
        Availability depends on your service zone and on staff and vehicle capacity.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Services are temporarily unavailable. Please try again later.
        </p>
      )}
      {!loadError && services.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No services have been published yet.
        </p>
      )}

      {services.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{SERVICE_CATEGORIES[s.category] || s.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/services/" + s.slug} className="text-emerald-900 underline">{s.title}</Link>
              </h2>
              <p className="mt-1 text-sm text-gray-700">For: {ELIGIBLE_LABELS[s.eligibleCustomer]}</p>
            </li>
          ))}
        </ul>
      )}

      {faqs.length > 0 && (
        <section className="mt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-bold text-emerald-900">Frequently asked questions</h2>
          <div className="mt-4 space-y-3">
            {faqs.map((f) => (
              <details key={f._id.toString()} className="rounded-md border border-gray-200 bg-white p-4">
                <summary className="cursor-pointer font-semibold">{f.question}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
