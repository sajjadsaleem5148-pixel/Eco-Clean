const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/auth/guards.js", `
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/roles";

export async function requireRole(allowedRoles, loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  if (!allowedRoles.includes(user.role)) redirect("/");
  return user;
}

export async function requireUser(loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}

export async function requirePermission(permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (!hasPermission(user.role, permission)) redirect("/admin");
  return user;
}

export async function requireActionPermission(permission) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, permission)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
`);

write("lib/audit/log.js", `
import connectDB from "@/lib/db/connect";
import AuditLog from "@/models/AuditLog";

export async function writeAudit({ actor, action, targetType, targetId, reason, metadata }) {
  try {
    await connectDB();
    await AuditLog.create({ actor, action, targetType, targetId, reason, metadata });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}
`);

write("actions/zones.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";

const zoneSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().max(500).optional(),
  targetCollectionEveryDays: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Minimum is 1 day")
    .max(30, "Maximum is 30 days"),
});

function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createZoneAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = zoneSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetCollectionEveryDays: formData.get("targetCollectionEveryDays"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const slug = makeSlug(parsed.data.name);
  if (!slug) return { error: "Name must contain letters or numbers" };

  try {
    await connectDB();
    const zone = await ServiceZone.create({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      targetCollectionEveryDays: parsed.data.targetCollectionEveryDays,
    });
    await writeAudit({
      actor: user.id,
      action: "zone.create",
      targetType: "ServiceZone",
      targetId: zone._id.toString(),
      metadata: { name: zone.name, slug: zone.slug },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return { error: "A zone with this name already exists." };
    }
    console.error("Create zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/zones");
  return { success: "Zone created." };
}
`);

write("components/forms/ZoneForm.js", `
"use client";

import { useActionState } from "react";
import { createZoneAction } from "@/actions/zones";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ZoneForm() {
  const [state, formAction, pending] = useActionState(createZoneAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Zone name</label>
        <input id="name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id="description" name="description" rows={3} maxLength={500} className={field} />
      </div>
      <div>
        <label htmlFor="targetCollectionEveryDays" className="mb-1 block text-sm font-medium">
          Target: collect every N days (a service target, not a guarantee)
        </label>
        <input id="targetCollectionEveryDays" name="targetCollectionEveryDays" type="number"
          min={1} max={30} defaultValue={3} required className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Create zone"}
      </button>
    </form>
  );
}
`);

write("app/admin/(panel)/zones/page.js", `
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import { requirePermission } from "@/lib/auth/guards";
import ZoneForm from "@/components/forms/ZoneForm";

export const metadata = { title: "Service Zones | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  await requirePermission("collections.manage");

  let zones = [];
  let loadError = false;
  try {
    await connectDB();
    zones = await ServiceZone.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load zones failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Service Zones</h1>
        <p className="mt-1 text-sm text-gray-600">
          Zones decide where services are available and how often collection is targeted.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Zones could not be loaded. The database may be unavailable.
          </p>
        )}

        {!loadError && zones.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No zones yet. Create the first one below.
          </p>
        )}

        {zones.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Target (days)</th>
                  <th scope="col" className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{z.name}</td>
                    <td className="py-2 pr-4">{z.status}</td>
                    <td className="py-2 pr-4">{z.targetCollectionEveryDays}</td>
                    <td className="py-2">{new Date(z.createdAt).toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a zone</h2>
        <ZoneForm />
      </section>
    </div>
  );
}
`);

write("app/(public)/waste-segregation/page.js", `
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import { bagNotice } from "@/lib/content/wasteBags";

export const metadata = { title: "Waste Segregation | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function loadCategories() {
  try {
    await connectDB();
    return await WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1 }).lean();
  } catch (err) {
    console.error("Load categories failed:", err.message);
    return null;
  }
}

export default async function WasteSegregationPage() {
  const categories = await loadCategories();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Waste Segregation Guide</h1>
      <p className="mt-2 text-sm text-gray-700">{bagNotice}</p>

      {categories === null && (
        <p role="alert" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The segregation guide is temporarily unavailable. Please try again later.
        </p>
      )}

      {categories && categories.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          The segregation guide has not been configured yet.
        </p>
      )}

      {categories && categories.length > 0 && (
        <div className="mt-8 space-y-6">
          {categories.map((c) => (
            <section key={c._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="inline-block rounded px-2 py-1 text-xs font-semibold text-white" style={{ backgroundColor: c.color }}>
                {c.name}
              </p>
              {c.description && <p className="mt-2 text-sm text-gray-700">{c.description}</p>}
              {c.acceptedMaterials.length > 0 && (
                <>
                  <h2 className="mt-3 text-sm font-semibold">Potentially accepted</h2>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {c.acceptedMaterials.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </>
              )}
              {c.prohibitedMaterials.length > 0 && (
                <>
                  <h2 className="mt-3 text-sm font-semibold">Needs separate approved disposal</h2>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                    {c.prohibitedMaterials.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
`);

write("app/dashboard/page.js", `
import { requireRole } from "@/lib/auth/guards";

export const metadata = { title: "Dashboard | ECO-CLEAN" };

export default async function DashboardPage() {
  const user = await requireRole(["RESIDENT"]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-bold text-emerald-900">Welcome, {user.name}</h1>
      <p className="mt-2 text-sm text-gray-700">Email: {user.email}</p>
      <p className="text-sm text-gray-700">Role: {user.role}</p>
      <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Your reports, collections and Green Points will appear here once those features are built.
      </p>
    </section>
  );
}
`);

write("scripts/seed-dev-data.js", `
const dns = require("node:dns");
const mongoose = require("mongoose");

process.loadEnvFile(".env.local");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const hazardous = [
  "Hazardous materials",
  "Batteries",
  "Medical waste and sharps",
  "Chemicals",
  "Electronic waste",
];

const categories = [
  {
    key: "green",
    name: "Green Bag - Organic Waste",
    color: "#047857",
    description: "Organic waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Fruit and vegetable scraps",
      "Suitable food waste",
      "Leaves and garden waste",
      "Locally approved biodegradable materials",
    ],
    sortOrder: 1,
  },
  {
    key: "blue",
    name: "Blue Bag - Recyclable Waste",
    color: "#1d4ed8",
    description: "Recyclable waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Paper and cardboard",
      "Suitable plastic packaging",
      "Metal cans",
      "Clean glass",
      "Other locally accepted recyclables",
    ],
    sortOrder: 2,
  },
  {
    key: "red",
    name: "Red Bag - Residual Waste",
    color: "#b91c1c",
    description: "Residual waste. Example list only; local rules may differ.",
    acceptedMaterials: [
      "Non-recyclable household waste",
      "Residual materials permitted under local disposal requirements",
    ],
    sortOrder: 3,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed script production mein nahi chal sakti.");
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI set nahi hai");

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const now = new Date();

  for (const c of categories) {
    const res = await db.collection("wastecategories").updateOne(
      { key: c.key },
      {
        $setOnInsert: {
          ...c,
          prohibitedMaterials: hazardous,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
    console.log(c.key + ": " + (res.upsertedCount ? "banayi" : "pehle se maujood"));
  }

  const zoneRes = await db.collection("servicezones").updateOne(
    { slug: "demo-zone-a" },
    {
      $setOnInsert: {
        name: "Demo Zone A",
        slug: "demo-zone-a",
        description: "Development demo data. Rename or delete before real use.",
        status: "ACTIVE",
        targetCollectionEveryDays: 3,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
  console.log("demo-zone-a: " + (zoneRes.upsertedCount ? "banayi" : "pehle se maujood"));

  await mongoose.disconnect();
  console.log("Seed mukammal.");
}

main().catch((err) => {
  console.error("Nakaam:", err.message);
  process.exit(1);
});
`);

console.log("\nSab files ban gayin.");