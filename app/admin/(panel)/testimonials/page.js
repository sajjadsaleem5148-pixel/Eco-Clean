import connectDB from "@/lib/db/connect";
import Testimonial from "@/models/Testimonial";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  TESTIMONIAL_STATUSES,
  TESTIMONIAL_STATUS_LABELS,
  TESTIMONIAL_TARGET_LABELS,
  MAX_PUBLIC_TESTIMONIALS,
  testimonialTargets,
} from "@/lib/testimonialRules";
import TestimonialForm, {
  EditTestimonialForm,
  TestimonialStatusButton,
} from "@/components/forms/TestimonialForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Testimonials | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/testimonials" + (status ? "?status=" + status : "");
}

export default async function AdminTestimonialsPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = TESTIMONIAL_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Testimonial.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(100)
      .populate("publishedBy", "name")
      .lean();
  } catch (err) {
    console.error("Load testimonials failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    TESTIMONIAL_STATUSES.map((s) => ({ label: TESTIMONIAL_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Testimonials</h1>
        <p className="mt-1 text-sm text-gray-600">
          Only enter words that a real person said and agreed to have shown publicly. The app records your confirmation
          but cannot check it. Published testimonials appear on the public Testimonials page (up to{" "}
          {MAX_PUBLIC_TESTIMONIALS}). A testimonial can be edited only while it is a draft. The consent note is never shown publicly.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Testimonials could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No testimonials match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((t) => {
              const id = t._id.toString();
              const plain = {
                id: id,
                quote: t.quote,
                authorName: t.authorName,
                authorDetail: t.authorDetail || "",
                consentNote: t.consentNote || "",
                consent: Boolean(t.consentConfirmed),
                sortOrder: typeof t.sortOrder === "number" ? t.sortOrder : 100,
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{t.authorName}</p>
                    <StatusBadge status={t.status} label={TESTIMONIAL_STATUS_LABELS[t.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{t.quote}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Order: {plain.sortOrder} | Consent: {t.consentConfirmed ? "recorded" : "NOT recorded"}
                    {t.consentNote ? " (" + t.consentNote + ")" : ""}
                    {t.publishedAt ? " | Published " + formatDateTime(t.publishedAt) : ""}
                    {t.publishedBy ? " by " + t.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {testimonialTargets(t.status).map((target) => (
                      <TestimonialStatusButton
                        key={target}
                        testimonialId={id}
                        target={target}
                        label={TESTIMONIAL_TARGET_LABELS[target]}
                      />
                    ))}
                  </div>
                  {t.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditTestimonialForm item={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Add a testimonial</h2>
        <TestimonialForm />
      </section>
    </div>
  );
}
