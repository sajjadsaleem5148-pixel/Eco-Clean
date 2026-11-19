import connectDB from "@/lib/db/connect";
import Campaign from "@/models/Campaign";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TARGET_LABELS,
  PHASE_LABELS,
  campaignTargets,
  campaignPhase,
} from "@/lib/campaignRules";
import CampaignForm, { EditCampaignForm, CampaignStatusButton } from "@/components/forms/CampaignForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Campaigns | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/campaigns" + (status ? "?status=" + status : "");
}

export default async function AdminCampaignsPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = CAMPAIGN_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Campaign.find(filter).sort({ createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load campaigns failed:", err.message);
    loadError = true;
  }

  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    CAMPAIGN_STATUSES.map((s) => ({ label: CAMPAIGN_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-600">
          Only published campaigns that have not ended appear on the public Campaigns page. A campaign can be edited
          only while it is a draft. Campaigns are not linked to points, rewards or reports yet. Dates are UTC days.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Campaigns could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No campaigns match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((c) => {
              const id = c._id.toString();
              const plain = {
                id: id,
                title: c.title,
                summary: c.summary,
                body: c.body || "",
                startDate: c.startDate || "",
                endDate: c.endDate || "",
              };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{c.title}</p>
                    <StatusBadge status={c.status} label={CAMPAIGN_STATUS_LABELS[c.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{c.summary}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    Dates: {c.startDate || "no start"} to {c.endDate || "no end"}
                    {c.status === "PUBLISHED" ? " | " + PHASE_LABELS[campaignPhase(c)] : ""}
                    {c.publishedAt ? " | Published " + formatDateTime(c.publishedAt) : ""}
                    {c.publishedBy ? " by " + c.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {campaignTargets(c.status).map((t) => (
                      <CampaignStatusButton key={t} campaignId={id} target={t} label={CAMPAIGN_TARGET_LABELS[t]} />
                    ))}
                  </div>
                  {c.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditCampaignForm campaign={plain} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a campaign</h2>
        <CampaignForm />
      </section>
    </div>
  );
}
