import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "CSV Exports | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminExportsPage() {
  await requirePermission("analytics.export");
  const range = parseRange("", "");

  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ name: 1 }).select("name").lean();
  } catch (err) {
    console.error("Load export zones failed:", err.message);
    loadError = true;
  }

  const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">CSV Exports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Exports contain counts and totals only. They never include names, emails, phone numbers or addresses.
          Every download is recorded in the audit log, and each person can download up to 20 files per hour.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Zones could not be loaded. You can still export for all zones.</ErrorNotice>
          </div>
        )}

        <form action="/api/admin/export" method="get" className="mt-4 space-y-4">
          <div>
            <label htmlFor="dataset" className="mb-1 block text-sm font-medium">Dataset</label>
            <select id="dataset" name="dataset" required defaultValue="" className={field}>
              <option value="" disabled>Choose a dataset</option>
              {DATASET_KEYS.map((k) => (
                <option key={k} value={k}>{DATASETS[k].label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="from" className="mb-1 block text-sm font-medium">From</label>
              <input id="from" name="from" type="date" required defaultValue={range.fromStr} className={field} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-sm font-medium">To</label>
              <input id="to" name="to" type="date" required defaultValue={range.toStr} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="zone" className="mb-1 block text-sm font-medium">Zone (reports and complaints only)</label>
            <select id="zone" name="zone" defaultValue="" className={field}>
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z._id.toString()} value={z._id.toString()}>{z.name}</option>
              ))}
            </select>
          </div>
          <button type="submit"
            className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
            Download CSV
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Available datasets</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {DATASET_KEYS.map((k) => (
            <li key={k}>
              <span className="font-semibold">{DATASETS[k].label}.</span> {DATASETS[k].description}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
