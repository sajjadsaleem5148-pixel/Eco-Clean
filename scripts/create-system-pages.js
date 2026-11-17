const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/permissions/roles.js",
  "lib/userAdmin.js",
  "lib/reportStatus.js",
  "lib/statusTone.js",
  "models/User.js",
  "models/AuditLog.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "tests/integration/helpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
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

write("lib/integrationStatus.js", `
// Describes each integration and which environment variables it needs.
// Only the NAMES of variables are used. Their values are never returned or shown.
export const INTEGRATIONS = [
  {
    key: "database",
    name: "Database (MongoDB)",
    purpose: "Stores every record. It must be a replica set, because points and rewards use transactions.",
    env: ["MONGODB_URI"],
    mode: "all",
    required: true,
    usedByApp: true,
  },
  {
    key: "auth",
    name: "Sign-in sessions",
    purpose: "Signs and protects login sessions.",
    env: ["AUTH_SECRET"],
    mode: "all",
    minLength: 32,
    required: true,
    usedByApp: true,
  },
  {
    key: "maps",
    name: "Maps and geocoding",
    purpose: "Pickup location on a map. Either provider is enough.",
    env: ["GOOGLE_MAPS_API_KEY", "MAPBOX_ACCESS_TOKEN"],
    mode: "any",
    required: false,
    usedByApp: false,
  },
  {
    key: "storage",
    name: "Private file storage",
    purpose: "Private photographs and documents.",
    env: ["STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_BUCKET"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
  {
    key: "email",
    name: "Email provider",
    purpose: "Password reset and email notifications.",
    env: ["EMAIL_PROVIDER_API_KEY"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
  {
    key: "sms",
    name: "SMS provider",
    purpose: "Optional text message notifications.",
    env: ["SMS_PROVIDER_API_KEY"],
    mode: "all",
    required: false,
    usedByApp: false,
  },
];

export function envStatus(integration, env) {
  const source = env || {};
  const min = Math.max(1, integration.minLength || 0);
  const present = integration.env.filter((name) => {
    const value = source[name];
    return typeof value === "string" && value.trim().length >= min;
  });
  const configured =
    integration.mode === "any" ? present.length > 0 : present.length === integration.env.length;
  const missing = configured ? [] : integration.env.filter((name) => !present.includes(name));
  return { configured: configured, missing: missing };
}

export const STATE_LABELS = {
  CONNECTED: "Connected (live check passed)",
  CONFIGURED: "Configured, not verified",
  NOT_CONFIGURED: "Not configured",
  FAILED: "Check failed",
};

// Reuses the existing status colours: green, amber, grey and red.
export const STATE_BADGE_STATUS = {
  CONNECTED: "ACTIVE",
  CONFIGURED: "PENDING",
  NOT_CONFIGURED: "DRAFT",
  FAILED: "REJECTED",
};

// Only the database has a real health check. Every other state is based on settings alone.
export function stateFor(integration, env, health) {
  if (integration.key === "database") {
    return health && health.ok ? "CONNECTED" : "FAILED";
  }
  return envStatus(integration, env).configured ? "CONFIGURED" : "NOT_CONFIGURED";
}
`);

write("services/systemStatus.js", `
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

// Never throws. A failed check is reported as ok: false.
export async function getDatabaseHealth() {
  try {
    await connectDB();
    const admin = mongoose.connection.db.admin();
    const started = Date.now();
    await admin.ping();
    const ms = Date.now() - started;
    const hello = await admin.command({ hello: 1 });
    return { ok: true, ms: ms, replicaSet: Boolean(hello && hello.setName) };
  } catch (err) {
    console.error("Database health check failed:", err.message);
    return { ok: false, ms: null, replicaSet: false };
  }
}

// Counts only. No personal data. Throws on database errors so the page can show an error.
export async function getSecuritySnapshot() {
  await connectDB();
  const [root, staff, suspended, audits, latest] = await Promise.all([
    User.exists({ isRootAdmin: true, status: "ACTIVE", deletedAt: null }),
    User.countDocuments({ role: { $in: ADMIN_ROLES }, status: "ACTIVE", deletedAt: null }),
    User.countDocuments({ status: "SUSPENDED", deletedAt: null }),
    AuditLog.countDocuments({}),
    AuditLog.findOne({}).sort({ createdAt: -1 }).select("createdAt").lean(),
  ]);
  return {
    rootAdminActive: Boolean(root),
    activeStaff: staff,
    suspendedAccounts: suspended,
    auditEntries: audits,
    latestAuditAt: latest ? latest.createdAt : null,
  };
}
`);

write("app/admin/(panel)/integrations/page.js", `
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
`);

write("app/admin/(panel)/roles/page.js", `
import { requirePermission } from "@/lib/auth/guards";
import { ROLES, PERMISSIONS, hasPermission } from "@/lib/permissions/roles";
import { ROLE_LABELS } from "@/lib/userAdmin";

export const metadata = { title: "Roles and Permissions | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  await requirePermission("admins.manage");

  const rows = Object.values(ROLES).map((role) => ({
    role: role,
    permissions: PERMISSIONS.filter((p) => hasPermission(role, p)),
  }));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Roles and Permissions</h1>
      <p className="mt-1 text-sm text-gray-600">
        This list is read-only. Roles and permissions are defined in the application code, so changing them needs a
        code change and a new deployment. Every action is also checked on the server, whatever a page shows.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-gray-200 text-gray-600">
            <tr>
              <th scope="col" className="py-2 pr-4">Role</th>
              <th scope="col" className="py-2 pr-4">Permissions</th>
              <th scope="col" className="py-2">Permissions held</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.role} className="border-b border-gray-100 align-top">
                <td className="py-2 pr-4 font-medium">{ROLE_LABELS[r.role] || r.role}</td>
                <td className="py-2 pr-4 text-gray-800">
                  {r.permissions.length === 0
                    ? "No admin permissions. This role only uses its own portal."
                    : r.permissions.join(", ")}
                </td>
                <td className="py-2">{r.permissions.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
`);

write("app/admin/(panel)/security-center/page.js", `
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
`);

write("app/admin/(panel)/backup/page.js", `
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
`);

write("tests/unit/integrationStatus.test.js", `
import { describe, it, expect } from "vitest";
import { INTEGRATIONS, envStatus, stateFor, STATE_LABELS, STATE_BADGE_STATUS } from "@/lib/integrationStatus";

function find(key) {
  return INTEGRATIONS.find((i) => i.key === key);
}

describe("envStatus", () => {
  it("is not configured when nothing is set", () => {
    const r = envStatus(find("storage"), {});
    expect(r.configured).toBe(false);
    expect(r.missing).toHaveLength(4);
  });

  it("needs every variable when the mode is all", () => {
    const partial = envStatus(find("storage"), { STORAGE_ENDPOINT: "x", STORAGE_BUCKET: "y" });
    expect(partial.configured).toBe(false);
    expect(partial.missing).toEqual(["STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"]);
    const full = envStatus(find("storage"), {
      STORAGE_ENDPOINT: "a",
      STORAGE_ACCESS_KEY_ID: "b",
      STORAGE_SECRET_ACCESS_KEY: "c",
      STORAGE_BUCKET: "d",
    });
    expect(full).toEqual({ configured: true, missing: [] });
  });

  it("needs only one variable when the mode is any", () => {
    expect(envStatus(find("maps"), { MAPBOX_ACCESS_TOKEN: "token" }).configured).toBe(true);
    expect(envStatus(find("maps"), {}).configured).toBe(false);
  });

  it("treats empty and blank values as missing", () => {
    expect(envStatus(find("email"), { EMAIL_PROVIDER_API_KEY: "" }).configured).toBe(false);
    expect(envStatus(find("email"), { EMAIL_PROVIDER_API_KEY: "   " }).configured).toBe(false);
  });

  it("rejects a session secret that is too short", () => {
    expect(envStatus(find("auth"), { AUTH_SECRET: "short" }).configured).toBe(false);
    expect(envStatus(find("auth"), { AUTH_SECRET: "x".repeat(32) }).configured).toBe(true);
  });

  it("never returns the value of a variable", () => {
    const secret = "super-secret-value-1234567890-abcdefghij";
    const r = envStatus(find("auth"), { AUTH_SECRET: secret });
    expect(JSON.stringify(r).includes(secret)).toBe(false);
  });
});

describe("stateFor", () => {
  it("says connected only for a database whose live check passed", () => {
    expect(stateFor(find("database"), {}, { ok: true })).toBe("CONNECTED");
    expect(stateFor(find("database"), { MONGODB_URI: "set" }, { ok: false })).toBe("FAILED");
    expect(stateFor(find("database"), { MONGODB_URI: "set" }, undefined)).toBe("FAILED");
  });

  it("never says connected for an integration that has no health check", () => {
    ["auth", "maps", "storage", "email", "sms"].forEach((key) => {
      const full = {};
      find(key).env.forEach((n) => {
        full[n] = "x".repeat(40);
      });
      expect(stateFor(find(key), full, { ok: true })).toBe("CONFIGURED");
      expect(stateFor(find(key), {}, { ok: true })).toBe("NOT_CONFIGURED");
    });
  });

  it("has a label and a badge colour for every state", () => {
    ["CONNECTED", "CONFIGURED", "NOT_CONFIGURED", "FAILED"].forEach((s) => {
      expect(STATE_LABELS[s]).toBeTruthy();
      expect(STATE_BADGE_STATUS[s]).toBeTruthy();
    });
  });

  it("marks only the database and sign-in sessions as required", () => {
    expect(INTEGRATIONS.filter((i) => i.required).map((i) => i.key)).toEqual(["database", "auth"]);
  });
});
`);

write("tests/integration/systemStatus.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { getDatabaseHealth, getSecuritySnapshot } from "@/services/systemStatus";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

describe("getDatabaseHealth", () => {
  it("reports a reachable replica set", async () => {
    const health = await getDatabaseHealth();
    expect(health.ok).toBe(true);
    expect(typeof health.ms).toBe("number");
    expect(health.replicaSet).toBe(true);
  });
});

describe("getSecuritySnapshot", () => {
  it("reports a missing root admin on an empty database", async () => {
    const snap = await getSecuritySnapshot();
    expect(snap).toEqual({
      rootAdminActive: false,
      activeStaff: 0,
      suspendedAccounts: 0,
      auditEntries: 0,
      latestAuditAt: null,
    });
  });

  it("counts active staff, suspended accounts and audit entries", async () => {
    await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true });
    await makeUser({ role: "SUPPORT_AGENT" });
    await makeUser({ role: "CONTENT_MANAGER", status: "SUSPENDED" });
    await makeUser({ role: "RESIDENT", status: "SUSPENDED" });
    await makeUser({ role: "RESIDENT" });
    await AuditLog.create({ action: "test.one" });
    await AuditLog.create({ action: "test.two" });

    const snap = await getSecuritySnapshot();
    expect(snap.rootAdminActive).toBe(true);
    expect(snap.activeStaff).toBe(2);
    expect(snap.suspendedAccounts).toBe(2);
    expect(snap.auditEntries).toBe(2);
    expect(snap.latestAuditAt).toBeTruthy();
  });

  it("does not count a suspended root admin as active", async () => {
    await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true, status: "SUSPENDED" });
    const snap = await getSecuritySnapshot();
    expect(snap.rootAdminActive).toBe(false);
  });

  it("returns counts only, never names or emails", async () => {
    const admin = await makeUser({ role: "SUPER_ADMIN", isRootAdmin: true });
    const snap = await getSecuritySnapshot();
    const text = JSON.stringify(snap);
    expect(text.includes(admin.email)).toBe(false);
    expect(text.includes(admin.name)).toBe(false);
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
const pagePermissions = {
  "app/admin/(panel)/integrations/page.js": "settings.manage",
  "app/admin/(panel)/roles/page.js": "admins.manage",
  "app/admin/(panel)/security-center/page.js": "security.manage",
  "app/admin/(panel)/backup/page.js": "settings.manage",
};
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (pagePermissions[f] && !src.includes('requirePermission("' + pagePermissions[f] + '")')) {
    problems.push("missing page permission check " + pagePermissions[f]);
  }
  if (f === "app/admin/(panel)/integrations/page.js") {
    if (/process\.env\.[A-Z_]+/.test(src)) problems.push("page must not read individual environment values");
    if (/\{process\.env/.test(src)) problems.push("page must not print environment values");
  }
  if (f === "lib/integrationStatus.js" && !/never returned or shown/.test(src)) problems.push("value-safety note missing");
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
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");