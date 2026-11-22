import connectDB from "@/lib/db/connect";
import Banner from "@/models/Banner";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { campaignPhase, PHASE_LABELS } from "@/lib/campaignRules";
import {
  BANNER_STATUSES,
  BANNER_STATUS_LABELS,
  BANNER_TARGET_LABELS,
  MAX_PUBLIC_BANNERS,
  bannerTargets,
} from "@/lib/bannerRules";
import BannerForm, { EditBannerForm, BannerStatusButton } from "@/components/forms/BannerForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Banners | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/banners" + (status ? "?status=" + status : "");
}

export default async function AdminBannersPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = BANNER_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Banner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load banners failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    BANNER_STATUSES.map((s) => ({ label: BANNER_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Banners</h1>
        <p className="mt-1 text-sm text-gray-600">
          Published banners that are running now appear under the announcements on every public page. At most{" "}
          {MAX_PUBLIC_BANNERS} are shown, in the order given. A banner can be edited only while it is a draft. Images are
          not part of this version. Dates are UTC days.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Banners could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No banners match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((b) => {
              const id = b._id.toString();
              const plain = {
                id: id,
                title: b.title,
                text: b.text,
                linkUrl: b.linkUrl || "",
                linkLabel: b.linkLabel || "",
                startDate: b.startDate || "",
                endDate: b.endDate || "",
                sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 100,
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{b.title}</p>
                    <StatusBadge status={b.status} label={BANNER_STATUS_LABELS[b.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{b.text}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Order: {plain.sortOrder} | Link: {b.linkUrl ? b.linkUrl : "none"} | Dates: {b.startDate || "no start"} to{" "}
                    {b.endDate || "no end"}
                    {b.status === "PUBLISHED" ? " | " + PHASE_LABELS[campaignPhase(b)] : ""}
                    {b.publishedAt ? " | Published " + formatDateTime(b.publishedAt) : ""}
                    {b.publishedBy ? " by " + b.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {bannerTargets(b.status).map((t) => (
                      <BannerStatusButton key={t} bannerId={id} target={t} label={BANNER_TARGET_LABELS[t]} />
                    ))}
                  </div>
                  {b.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditBannerForm banner={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a banner</h2>
        <BannerForm />
      </section>
    </div>
  );
}
