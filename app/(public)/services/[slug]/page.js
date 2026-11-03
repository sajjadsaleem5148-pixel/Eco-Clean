import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import Service from "@/models/Service";
import { SERVICE_CATEGORIES, ELIGIBLE_LABELS } from "@/lib/contentStatus";

export const metadata = { title: "Service | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) notFound();

  let service = null;
  try {
    await connectDB();
    service = await Service.findOne({ slug, status: "PUBLISHED", deletedAt: null })
      .select("title description category eligibleCustomer availability collectionInstructions")
      .lean();
  } catch (err) {
    console.error("Load service failed:", err.message);
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This service could not be loaded. Please try again later.
        </p>
      </main>
    );
  }

  if (!service) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/services" className="text-sm font-semibold text-emerald-800 underline">Back to services</Link>
      <p className="mt-3 text-sm font-semibold text-emerald-800">{SERVICE_CATEGORIES[service.category] || service.category}</p>
      <h1 className="text-3xl font-bold text-emerald-900">{service.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm text-gray-800">{service.description}</p>
      <dl className="mt-6 space-y-3 text-sm">
        <div><dt className="font-medium text-gray-600">Eligible customers</dt><dd>{ELIGIBLE_LABELS[service.eligibleCustomer]}</dd></div>
        {service.availability && (
          <div><dt className="font-medium text-gray-600">Availability</dt><dd>{service.availability}</dd></div>
        )}
        {service.collectionInstructions && (
          <div><dt className="font-medium text-gray-600">Collection instructions</dt><dd className="whitespace-pre-wrap">{service.collectionInstructions}</dd></div>
        )}
      </dl>
    </main>
  );
}
