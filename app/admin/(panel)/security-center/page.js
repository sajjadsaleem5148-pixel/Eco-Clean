import { requirePermission } from "@/lib/auth/guards";
import { getSecuritySnapshot } from "@/services/systemStatus";
import { formatDateTime } from "@/lib/reportStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Security Center | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const CODE_SETTINGS = [
  { item: "Login rate limiting", value: "On. 10 attempts per email and 30 per network address every 15 minutes." },
  { item: "Session length", value: "8 hours. Sessions also end after a password change, suspension or role change." },
  { item: "Password storage", value: "Passwords are hashed with bcrypt. They are never stored as text." },
  { item: "Sensitive admin actions", value: "The admin must enter their own password again." },
  {
    item: "Audit log",
    value: "Append-only in the application code. A database administrator can still change the database directly.",
  },
];

const NOT_AVAILABLE = [
  "Multi-factor authentication for administrators",
  "Password reset by email",
  "Email verification",
];

export default async function AdminSecurityCenterPage() {
  await requirePermission("security.manage");

  let snap = null;
  let loadError = false;
  try {
    snap = await getSecuritySnapshot();
  } catch (err) {
    console.error("Load security snapshot failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Security Center</h1>
        <p className="mt-1 text-sm text-gray-600">
          The first table is a live check of the database. The second table describes how the application code is set
          up, which is not a live test. Failed login attempts are not recorded yet, so none are shown.
        </p>
        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Security data could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
      </section>

      {snap && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Live checks</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <caption className="sr-only">Live security checks</caption>
              <tbody>
                <tr className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-4 font-medium">Root Super Admin account</th>
                  <td className="py-2">
                    <StatusBadge
                      status={snap.rootAdminActive ? "ACTIVE" : "REJECTED"}
                      label={snap.rootAdminActive ? "Present and active" : "Missing or not active"}
                    />
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-4 font-medium">Active staff accounts</th>
                  <td className="py-2">{snap.activeStaff}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-4 font-medium">Suspended accounts</th>
                  <td className="py-2">{snap.suspendedAccounts}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-4 font-medium">Audit log entries</th>
                  <td className="py-2">
                    {snap.auditEntries}
                    {snap.latestAuditAt ? " (latest: " + formatDateTime(snap.latestAuditAt) + ")" : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Settings in the code</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {CODE_SETTINGS.map((s) => (
            <li key={s.item}>
              <span className="font-semibold">{s.item}.</span> {s.value}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Not available yet</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          {NOT_AVAILABLE.map((n) => (
            <li key={n}>
              <StatusBadge status="DRAFT" label="Not available" /> <span className="ml-1">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
