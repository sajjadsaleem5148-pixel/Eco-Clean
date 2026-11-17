import { requirePermission } from "@/lib/auth/guards";
import { getDatabaseHealth } from "@/services/systemStatus";
import { INTEGRATIONS, envStatus, stateFor, STATE_LABELS, STATE_BADGE_STATUS } from "@/lib/integrationStatus";
import StatusBadge from "@/components/ui/StatusBadge";

export const metadata = { title: "Integrations | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  await requirePermission("settings.manage");
  const health = await getDatabaseHealth();

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
      <p className="mt-1 text-sm text-gray-600">
        Only the database has a live health check. For every other integration this page can only tell whether the
        settings exist, so it never says &quot;connected&quot; for them. The values of the settings are never shown.
        Settings are changed in the server environment, not on this page.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th scope="col" className="py-2 pr-4">Integration</th>
              <th scope="col" className="py-2 pr-4">Status</th>
              <th scope="col" className="py-2 pr-4">Required settings</th>
              <th scope="col" className="py-2 pr-4">Used by the app</th>
              <th scope="col" className="py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map((item) => {
              const state = stateFor(item, process.env, health);
              const info = envStatus(item, process.env);
              return (
                <tr key={item.key} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-xs text-gray-600">{item.required ? "Required" : "Optional"}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={STATE_BADGE_STATUS[state]} label={STATE_LABELS[state]} />
                  </td>
                  <td className="py-2 pr-4">
                    <ul className="space-y-1 text-xs text-gray-800">
                      {item.env.map((name) => (
                        <li key={name}>
                          {name}
                          {info.missing.includes(name) ? " (missing)" : ""}
                        </li>
                      ))}
                    </ul>
                    {item.mode === "any" && <span className="text-xs text-gray-600">One of these is enough.</span>}
                  </td>
                  <td className="py-2 pr-4">{item.usedByApp ? "Yes" : "No, no feature uses it yet"}</td>
                  <td className="py-2 text-gray-700">
                    {item.purpose}
                    {item.key === "database" && health.ok && (
                      <span className="mt-1 block text-xs">
                        Response time: {health.ms} ms. Replica set:{" "}
                        {health.replicaSet ? "yes (transactions work)" : "no (points and rewards will fail)"}.
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
