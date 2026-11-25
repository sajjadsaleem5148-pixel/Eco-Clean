import { requirePermission } from "@/lib/auth/guards";
import { INTEGRATIONS, envStatus } from "@/lib/integrationStatus";
import StatusBadge from "@/components/ui/StatusBadge";

export const metadata = { title: "Media Library | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  await requirePermission("content.publish");
  const storage = INTEGRATIONS.find((i) => i.key === "storage");
  const info = envStatus(storage, process.env);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Uploading is not available. There is no file upload feature yet, so no photograph or document can be added
          anywhere on the site.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Private storage</h2>
        <p className="mt-2 text-sm text-gray-800">
          <StatusBadge
            status={info.configured ? "PENDING" : "DRAFT"}
            label={info.configured ? "Settings found, no feature uses them yet" : "Not configured"}
          />
        </p>
        <p className="mt-3 text-sm text-gray-700">
          Photographs of garbage need private storage that is not open to the public. These settings are needed on the
          server. Only their names are shown, never their values.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-gray-800">
          {storage.env.map((name) => (
            <li key={name}>
              {name}
              {info.missing.includes(name) ? " (missing)" : " (set)"}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
