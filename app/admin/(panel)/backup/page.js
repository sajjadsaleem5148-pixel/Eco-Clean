import { requirePermission } from "@/lib/auth/guards";
import { getDatabaseHealth } from "@/services/systemStatus";
import StatusBadge from "@/components/ui/StatusBadge";

export const metadata = { title: "Backup and Maintenance | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const CHECKLIST = [
  "Open your database provider (for example MongoDB Atlas) and confirm that automatic backups are turned on.",
  "Write down how much data you can afford to lose (recovery point) and how fast you must be back (recovery time).",
  "Restore a backup into a separate empty database and confirm that the application works with it.",
  "Keep the database password and AUTH_SECRET in a password manager, not in chat or in the code.",
  "Repeat the restore test after major changes.",
];

export default async function AdminBackupPage() {
  await requirePermission("settings.manage");
  const health = await getDatabaseHealth();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Backup and Maintenance</h1>
        <p className="mt-1 text-sm text-gray-600">
          This application does not create or check backups. Backups are made by your database provider, and this page
          cannot see whether they are working. A backup only counts once a restore has been tested.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">What this page can check</h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-800">
          <li>
            Database reachable:{" "}
            <StatusBadge
              status={health.ok ? "ACTIVE" : "REJECTED"}
              label={health.ok ? "Yes (" + health.ms + " ms)" : "No"}
            />
          </li>
          <li>
            Replica set (needed for transactions):{" "}
            <StatusBadge
              status={health.replicaSet ? "ACTIVE" : "REJECTED"}
              label={health.replicaSet ? "Yes" : "No"}
            />
          </li>
          <li>
            Backups and restore tests: <StatusBadge status="DRAFT" label="Not verified by this app" />
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Checklist for you</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-800">
          {CHECKLIST.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-gray-600">
          Maintenance mode and data retention rules are not part of this version.
        </p>
      </section>
    </div>
  );
}
