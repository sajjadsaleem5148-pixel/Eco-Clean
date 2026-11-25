const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "lib/auth/guards.js",
  "lib/integrationStatus.js",
  "lib/zoneStatus.js",
  "services/zoneCoverage.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("app/(auth)/forgot-password/page.js", `
import Link from "next/link";

export const metadata = { title: "Forgot Password | ECO-CLEAN" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Forgot your password?</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Password reset by email is not available yet, because no email service is set up. No reset link can be sent.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        If you are signed in, you can change your password under Settings. If you cannot sign in, please{" "}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link> and a staff
        member will review your request.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-emerald-800 underline">Back to log in</Link>
      </p>
    </main>
  );
}
`);

write("app/(auth)/reset-password/page.js", `
import Link from "next/link";

export const metadata = { title: "Reset Password | ECO-CLEAN" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Reset password</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Reset links are not available yet, because no email service is set up. A link you received from this site
        cannot be used to reset a password.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        Please <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link> for help
        with your account.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-emerald-800 underline">Back to log in</Link>
      </p>
    </main>
  );
}
`);

write("app/admin/(auth)/forgot-password/page.js", `
import Link from "next/link";

export const metadata = { title: "Staff Password Help | ECO-CLEAN" };

export default function AdminForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Staff password help</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Password reset by email is not available yet, because no email service is set up.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        Ask another administrator, or the person who runs the server, to reset your password. When you are signed in you
        can change it under My Security.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/admin/login" className="font-semibold text-emerald-800 underline">Back to staff log in</Link>
      </p>
    </main>
  );
}
`);

write("app/admin/(panel)/media/page.js", `
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
`);

write("app/admin/(panel)/operations-map/page.js", `
import { requirePermission } from "@/lib/auth/guards";
import { getZoneCoverage } from "@/services/zoneCoverage";
import { INTEGRATIONS, envStatus } from "@/lib/integrationStatus";
import { ZONE_STATUS_LABELS } from "@/lib/zoneStatus";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Operations Map | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminOperationsMapPage() {
  await requirePermission("reports.read");
  const maps = INTEGRATIONS.find((i) => i.key === "maps");
  const info = envStatus(maps, process.env);

  let data = null;
  let loadError = false;
  try {
    data = await getZoneCoverage();
  } catch (err) {
    console.error("Load operations overview failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Operations Map</h1>
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          There is no map. Reports do not store a map location yet, so nothing can be placed on a map. The table below
          shows the same operations by zone in text form.
        </p>
        <p className="mt-3 text-sm text-gray-800">
          Map provider:{" "}
          <StatusBadge
            status={info.configured ? "PENDING" : "DRAFT"}
            label={info.configured ? "Settings found, no feature uses them yet" : "Not configured"}
          />
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Operations by zone</h2>
        {loadError && (
          <div className="mt-3">
            <ErrorNotice>The overview could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {data && data.rows.length === 0 && (
          <div className="mt-3">
            <EmptyState>No zones exist yet.</EmptyState>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Zone</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2 pr-4">Active collectors</th>
                  <th scope="col" className="py-2">Confirmed schedules</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{r.name}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={r.status} label={ZONE_STATUS_LABELS[r.status]} />
                    </td>
                    <td className="py-2 pr-4">{r.openReports}</td>
                    <td className="py-2 pr-4">{r.collectors}</td>
                    <td className="py-2">{r.schedules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
`);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("still a placeholder");
  if (!code.includes("<h1")) problems.push("needs a main heading");
  if (/animate-|hover:scale|transition|gradient|dangerouslySetInnerHTML/.test(code)) problems.push("animation, gradient or raw HTML");
  if (/<form\b|<input\b/.test(code)) problems.push("must not contain a fake form");
  if (f.startsWith("app/admin/(panel)/") && !code.includes("requirePermission(")) problems.push("missing permission check");
  if (f.includes("media") && /process\.env\.[A-Z_]+/.test(code)) problems.push("must not read single env values");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked.");