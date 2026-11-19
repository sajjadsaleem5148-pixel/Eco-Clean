import { listPublicCampaigns } from "@/services/campaigns";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Campaigns | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  let campaigns = [];
  let loadError = false;
  try {
    campaigns = await listPublicCampaigns();
  } catch (err) {
    console.error("Load public campaigns failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Community Campaigns</h1>
      <p className="mt-2 text-sm text-gray-700">
        Current and upcoming campaigns published by ECO-CLEAN staff.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Campaigns are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && campaigns.length === 0 && (
        <div className="mt-6">
          <EmptyState>There are no campaigns right now.</EmptyState>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="mt-6 space-y-4">
          {campaigns.map((c) => (
            <section key={c.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{c.title}</h2>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                {c.phase === "UPCOMING" ? "Starts on " + c.startDate : "Running now"}
                {c.endDate ? " | Ends on " + c.endDate : ""}
              </p>
              <p className="mt-2 text-sm text-gray-800">{c.summary}</p>
              {c.body && <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{c.body}</div>}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
