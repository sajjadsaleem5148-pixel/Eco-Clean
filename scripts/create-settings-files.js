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
  "lib/audit/log.js",
  "lib/permissions/roles.js",
  "lib/contactStatus.js",
  "models/AuditLog.js",
  "components/forms/ContactForm.js",
  "components/layout/Footer.js",
  "components/ui/ErrorNotice.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
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

write("lib/siteSettings.js", `
export const SETTINGS_KEY = "site";

export const SOCIAL_FIELDS = [
  { key: "facebookUrl", label: "Facebook" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "xUrl", label: "X (Twitter)" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "youtubeUrl", label: "YouTube" },
];

export const FIELD_KEYS = ["contactEmail", "contactPhone", "address", "openingHours"].concat(
  SOCIAL_FIELDS.map((f) => f.key)
);

export const PHONE_PATTERN = /^[+]?[0-9 ()-]{6,25}$/;

export function isPlainEmail(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\\s@<>"]+@[^\\s@<>"]+\\.[^\\s@<>"]+$/.test(value);
}

// Only a full https address is allowed. javascript:, http:, links with a password and bare hosts are dropped.
export function safeHttpsUrl(value) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length === 0 || text.length > 200) return undefined;
  let url;
  try {
    url = new URL(text);
  } catch (err) {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;
  if (!url.hostname.includes(".")) return undefined;
  return url.toString();
}

export function telHref(phone) {
  return "tel:" + String(phone || "").replace(/[^0-9+]/g, "");
}
`);

write("models/SiteSettings.js", `
import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    contactEmail: { type: String, trim: true, maxlength: 200 },
    contactPhone: { type: String, trim: true, maxlength: 25 },
    address: { type: String, trim: true, maxlength: 300 },
    openingHours: { type: String, trim: true, maxlength: 200 },
    facebookUrl: { type: String, trim: true, maxlength: 200 },
    instagramUrl: { type: String, trim: true, maxlength: 200 },
    xUrl: { type: String, trim: true, maxlength: 200 },
    linkedinUrl: { type: String, trim: true, maxlength: 200 },
    youtubeUrl: { type: String, trim: true, maxlength: 200 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.SiteSettings || mongoose.model("SiteSettings", settingsSchema);
`);

write("services/siteSettings.js", `
import connectDB from "@/lib/db/connect";
import SiteSettings from "@/models/SiteSettings";
import { SETTINGS_KEY, SOCIAL_FIELDS, FIELD_KEYS, isPlainEmail, safeHttpsUrl, PHONE_PATTERN } from "@/lib/siteSettings";

const EMPTY = { email: "", phone: "", address: "", hours: "", socials: [] };

// For public pages. It never throws: if the database is down the page simply shows no contact details.
// Every value is checked again here, so a bad value stored directly in the database is never shown.
export async function getContactSettings() {
  try {
    await connectDB();
    const doc = await SiteSettings.findOne({ key: SETTINGS_KEY }).lean();
    if (!doc) return EMPTY;
    return {
      email: isPlainEmail(doc.contactEmail) ? doc.contactEmail : "",
      phone: PHONE_PATTERN.test(doc.contactPhone || "") ? doc.contactPhone : "",
      address: doc.address || "",
      hours: doc.openingHours || "",
      socials: SOCIAL_FIELDS.map((f) => ({ label: f.label, url: safeHttpsUrl(doc[f.key]) })).filter((s) => s.url),
    };
  } catch (err) {
    console.error("Load contact settings failed:", err.message);
    return EMPTY;
  }
}

// For the admin form. It throws on error so the page can show an error message.
export async function getSettingsForEdit() {
  await connectDB();
  const doc = await SiteSettings.findOne({ key: SETTINGS_KEY }).lean();
  const out = {};
  FIELD_KEYS.forEach((k) => {
    out[k] = doc && doc[k] ? doc[k] : "";
  });
  return out;
}
`);

write("actions/settings.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import SiteSettings from "@/models/SiteSettings";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  SETTINGS_KEY,
  SOCIAL_FIELDS,
  FIELD_KEYS,
  PHONE_PATTERN,
  isPlainEmail,
  safeHttpsUrl,
} from "@/lib/siteSettings";

const social = z
  .string()
  .trim()
  .max(200, "Address is too long")
  .refine((v) => v === "" || safeHttpsUrl(v) !== undefined, "Social links must be full https:// addresses");

const shape = {
  contactEmail: z
    .string()
    .trim()
    .max(200, "Email is too long")
    .refine((v) => v === "" || isPlainEmail(v), "Enter a valid email address"),
  contactPhone: z
    .string()
    .trim()
    .max(25, "Phone number is too long")
    .refine((v) => v === "" || PHONE_PATTERN.test(v), "Enter a valid phone number"),
  address: z.string().trim().max(300, "Address is too long"),
  openingHours: z.string().trim().max(200, "Opening hours text is too long"),
};
SOCIAL_FIELDS.forEach((f) => {
  shape[f.key] = social;
});
const schema = z.object(shape);

export async function saveContactSettingsAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("settings.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const raw = {};
  FIELD_KEYS.forEach((k) => {
    raw[k] = String(formData.get(k) || "");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const values = {};
  FIELD_KEYS.forEach((k) => {
    const v = parsed.data[k];
    values[k] = k.endsWith("Url") ? safeHttpsUrl(v) || "" : k === "contactEmail" ? v.toLowerCase() : v;
  });

  try {
    await connectDB();
    const existing = await SiteSettings.findOne({ key: SETTINGS_KEY }).lean();
    const changed = FIELD_KEYS.filter((k) => ((existing && existing[k]) || "") !== values[k]);
    if (changed.length === 0) return { success: "No changes to save." };

    await SiteSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      { $set: Object.assign({}, values, { updatedBy: user.id }) },
      { upsert: true, returnDocument: "after" }
    );

    await writeAudit({
      actor: user.id,
      action: "settings.contact.update",
      targetType: "SiteSettings",
      targetId: SETTINGS_KEY,
      metadata: { fields: changed },
    });
  } catch (err) {
    console.error("Save settings failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { success: "Settings saved. The footer and Contact page now show these details." };
}
`);

write("components/forms/SettingsForm.js", `
"use client";

import { useActionState } from "react";
import { saveContactSettingsAction } from "@/actions/settings";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

// values: object with every field key. socials: [{ key, label }]
export default function SettingsForm({ values, socials }) {
  const [state, formAction, pending] = useActionState(saveContactSettingsAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="st-email" className="mb-1 block text-sm font-medium">Public email</label>
        <input id="st-email" name="contactEmail" type="email" maxLength={200} defaultValue={values.contactEmail} className={field} />
      </div>
      <div>
        <label htmlFor="st-phone" className="mb-1 block text-sm font-medium">Public phone number</label>
        <input id="st-phone" name="contactPhone" type="tel" maxLength={25} defaultValue={values.contactPhone} className={field} />
      </div>
      <div>
        <label htmlFor="st-address" className="mb-1 block text-sm font-medium">Office address</label>
        <textarea id="st-address" name="address" rows={3} maxLength={300} defaultValue={values.address} className={field} />
      </div>
      <div>
        <label htmlFor="st-hours" className="mb-1 block text-sm font-medium">Opening hours</label>
        <input id="st-hours" name="openingHours" type="text" maxLength={200} defaultValue={values.openingHours} className={field} />
      </div>
      <fieldset className="space-y-4 rounded-md border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold">Social links (full https:// addresses)</legend>
        {socials.map((s) => (
          <div key={s.key}>
            <label htmlFor={"st-" + s.key} className="mb-1 block text-sm font-medium">{s.label}</label>
            <input id={"st-" + s.key} name={s.key} type="url" maxLength={200} defaultValue={values[s.key]} className={field} />
          </div>
        ))}
      </fieldset>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
`);

write("components/layout/Footer.js", `
import Link from "next/link";
import { getContactSettings } from "@/services/siteSettings";
import { telHref } from "@/lib/siteSettings";

const linkClass = "text-emerald-100 underline hover:text-white";

export default async function Footer() {
  const c = await getContactSettings();
  const hasContact = Boolean(c.email || c.phone || c.address || c.hours || c.socials.length > 0);

  return (
    <footer className="mt-12 bg-emerald-950 text-emerald-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold tracking-tight text-white">ECO-CLEAN</p>
          <p className="mt-2 text-sm text-emerald-100">Clean Your Community. Grow a Greener Future.</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-white">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/services" className={linkClass}>Services</Link></li>
            <li><Link href="/waste-segregation" className={linkClass}>Waste Segregation</Link></li>
            <li><Link href="/rewards" className={linkClass}>Rewards</Link></li>
            <li><Link href="/complaints" className={linkClass}>Complaints</Link></li>
            <li><Link href="/contact" className={linkClass}>Contact</Link></li>
            <li><Link href="/privacy" className={linkClass}>Privacy Policy</Link></li>
            <li><Link href="/terms" className={linkClass}>Terms</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          {!hasContact && (
            <p className="mt-2 text-sm text-emerald-100">
              Contact details and social links will appear here once an administrator configures them.
            </p>
          )}
          {hasContact && (
            <ul className="mt-2 space-y-1 text-sm text-emerald-100">
              {c.email && (
                <li><a href={"mailto:" + c.email} className={linkClass}>{c.email}</a></li>
              )}
              {c.phone && (
                <li><a href={telHref(c.phone)} className={linkClass}>{c.phone}</a></li>
              )}
              {c.address && <li className="whitespace-pre-line">{c.address}</li>}
              {c.hours && <li>{c.hours}</li>}
              {c.socials.map((s) => (
                <li key={s.label}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-emerald-900 px-4 py-4 text-center text-xs text-emerald-100">
        &copy; {new Date().getFullYear()} ECO-CLEAN. All rights reserved.
      </div>
    </footer>
  );
}
`);

write("app/(public)/contact/page.js", `
import ContactForm from "@/components/forms/ContactForm";
import { CONTACT_CATEGORIES } from "@/lib/contactStatus";
import { getContactSettings } from "@/services/siteSettings";
import { telHref } from "@/lib/siteSettings";

export const metadata = { title: "Contact | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const categories = Object.entries(CONTACT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const c = await getContactSettings();
  const hasDetails = Boolean(c.email || c.phone || c.address || c.hours);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Contact us</h1>
      <p className="mt-2 text-sm text-gray-700">
        Send us a message and a staff member will review it. For missed pickups or other service problems,
        please use the Complaints page so you get a ticket you can track.
      </p>

      {hasDetails ? (
        <section aria-label="Contact details" className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
          <ul className="space-y-1">
            {c.email && (
              <li>Email: <a href={"mailto:" + c.email} className="font-semibold text-emerald-800 underline">{c.email}</a></li>
            )}
            {c.phone && (
              <li>Phone: <a href={telHref(c.phone)} className="font-semibold text-emerald-800 underline">{c.phone}</a></li>
            )}
            {c.address && <li className="whitespace-pre-line">Address: {c.address}</li>}
            {c.hours && <li>Opening hours: {c.hours}</li>}
          </ul>
        </section>
      ) : (
        <p className="mt-2 text-sm text-gray-700">
          Public phone numbers and addresses will appear here once an administrator configures them.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <ContactForm categories={categories} />
      </div>
    </main>
  );
}
`);

write("app/admin/(panel)/settings/page.js", `
import { requirePermission } from "@/lib/auth/guards";
import { getSettingsForEdit } from "@/services/siteSettings";
import { SOCIAL_FIELDS } from "@/lib/siteSettings";
import SettingsForm from "@/components/forms/SettingsForm";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "General Settings | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requirePermission("settings.manage");

  let values = null;
  let loadError = false;
  try {
    values = await getSettingsForEdit();
  } catch (err) {
    console.error("Load settings failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
      <p className="mt-1 text-sm text-gray-600">
        These contact details are shown publicly in the footer and on the Contact page. Leave a field empty to hide it.
        Only enter details that are real and approved. Logo, colours, timezone and maintenance mode are not part of
        this version.
      </p>

      {loadError && (
        <div className="mt-4">
          <ErrorNotice>Settings could not be loaded. The database may be unavailable.</ErrorNotice>
        </div>
      )}
      {values && (
        <div className="mt-4">
          <SettingsForm values={values} socials={SOCIAL_FIELDS} />
        </div>
      )}
    </section>
  );
}
`);

write("tests/unit/siteSettings.test.js", `
import { describe, it, expect } from "vitest";
import { safeHttpsUrl, isPlainEmail, telHref, PHONE_PATTERN, FIELD_KEYS } from "@/lib/siteSettings";

describe("safeHttpsUrl", () => {
  it("accepts a normal https address", () => {
    expect(safeHttpsUrl("https://facebook.com/ecoclean")).toBe("https://facebook.com/ecoclean");
    expect(safeHttpsUrl("  https://www.instagram.com/eco  ")).toBe("https://www.instagram.com/eco");
  });

  it("drops script, http and other schemes", () => {
    expect(safeHttpsUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpsUrl("http://facebook.com/eco")).toBeUndefined();
    expect(safeHttpsUrl("data:text/html,hi")).toBeUndefined();
    expect(safeHttpsUrl("ftp://example.com/file")).toBeUndefined();
  });

  it("drops links with a username or password and bare hosts", () => {
    expect(safeHttpsUrl("https://user:secret@example.com")).toBeUndefined();
    expect(safeHttpsUrl("https://localhost")).toBeUndefined();
  });

  it("drops empty, non-text and very long values", () => {
    expect(safeHttpsUrl("")).toBeUndefined();
    expect(safeHttpsUrl("   ")).toBeUndefined();
    expect(safeHttpsUrl(undefined)).toBeUndefined();
    expect(safeHttpsUrl(42)).toBeUndefined();
    expect(safeHttpsUrl("https://example.com/" + "a".repeat(300))).toBeUndefined();
  });
});

describe("isPlainEmail and phone", () => {
  it("accepts normal emails and rejects odd ones", () => {
    expect(isPlainEmail("hello@example.com")).toBe(true);
    ["", "no-at-sign", "a@b", "a b@example.com", "<x>@example.com", null, undefined].forEach((v) => {
      expect(isPlainEmail(v)).toBe(false);
    });
  });

  it("accepts normal phone numbers and rejects letters", () => {
    ["+92 21 1234567", "(021) 123-4567", "0300 1234567"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(true));
    ["call me", "12", "<script>", ""].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(false));
  });

  it("builds a tel link with digits and plus only", () => {
    expect(telHref("+92 (21) 123-4567")).toBe("tel:+92211234567");
  });
});

describe("field list", () => {
  it("has the four contact fields and five social links", () => {
    expect(FIELD_KEYS).toHaveLength(9);
    expect(FIELD_KEYS).toContain("contactEmail");
    expect(FIELD_KEYS).toContain("youtubeUrl");
  });
});
`);

write("tests/integration/settings.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { saveContactSettingsAction } from "@/actions/settings";
import { getContactSettings } from "@/services/siteSettings";
import SiteSettings from "@/models/SiteSettings";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function settingsForm(overrides) {
  return form(
    Object.assign(
      {
        contactEmail: "Hello@Example.com",
        contactPhone: "+92 21 1234567",
        address: "12 Main Street",
        openingHours: "Mon-Fri 9am to 5pm",
        facebookUrl: "https://facebook.com/ecoclean",
        instagramUrl: "",
        xUrl: "",
        linkedinUrl: "",
        youtubeUrl: "",
      },
      overrides || {}
    )
  );
}

async function asAdmin() {
  const admin = await makeUser({ role: "SUPER_ADMIN" });
  signInAs(admin);
  return admin;
}

describe("saveContactSettingsAction", () => {
  it("saves the details, lowercases the email and records an audit entry", async () => {
    const admin = await asAdmin();
    const out = await run(() => saveContactSettingsAction(null, settingsForm()));
    expect(out.result.success).toBeTruthy();

    const saved = await SiteSettings.findOne({ key: "site" }).lean();
    expect(saved.contactEmail).toBe("hello@example.com");
    expect(saved.facebookUrl).toBe("https://facebook.com/ecoclean");
    expect(String(saved.updatedBy)).toBe(String(admin._id));

    const logs = await AuditLog.find({ action: "settings.contact.update" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.fields).toContain("contactEmail");
    expect(JSON.stringify(logs[0].metadata).includes("hello@example.com")).toBe(false);
  });

  it("says so when nothing changed and writes no second audit entry", async () => {
    await asAdmin();
    await run(() => saveContactSettingsAction(null, settingsForm()));
    const again = await run(() => saveContactSettingsAction(null, settingsForm()));
    expect(again.result.success).toMatch(/no changes/i);
    expect(await AuditLog.countDocuments({ action: "settings.contact.update" })).toBe(1);
  });

  it("clears a field when it is saved empty", async () => {
    await asAdmin();
    await run(() => saveContactSettingsAction(null, settingsForm()));
    await run(() => saveContactSettingsAction(null, settingsForm({ contactPhone: "" })));
    const saved = await SiteSettings.findOne({ key: "site" }).lean();
    expect(saved.contactPhone).toBe("");
    expect((await getContactSettings()).phone).toBe("");
  });

  it("rejects a bad email, a bad phone number and unsafe social links", async () => {
    await asAdmin();
    const a = await run(() => saveContactSettingsAction(null, settingsForm({ contactEmail: "not-an-email" })));
    expect(a.result.error).toMatch(/email/i);
    const b = await run(() => saveContactSettingsAction(null, settingsForm({ contactPhone: "call me" })));
    expect(b.result.error).toMatch(/phone/i);
    for (const bad of ["javascript:alert(1)", "http://facebook.com/eco", "https://user:pw@example.com"]) {
      const c = await run(() => saveContactSettingsAction(null, settingsForm({ youtubeUrl: bad })));
      expect(c.result.error).toMatch(/https/i);
    }
    expect(await SiteSettings.countDocuments({})).toBe(0);
  });

  it("refuses every role except the Super Admin, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => saveContactSettingsAction(null, settingsForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => saveContactSettingsAction(null, settingsForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await SiteSettings.countDocuments({})).toBe(0);
    expect(await AuditLog.countDocuments({})).toBe(0);
  });
});

describe("getContactSettings", () => {
  it("returns empty details when nothing is configured", async () => {
    const c = await getContactSettings();
    expect(c).toEqual({ email: "", phone: "", address: "", hours: "", socials: [] });
  });

  it("shows only valid values and never an unsafe link stored directly in the database", async () => {
    await SiteSettings.create({
      key: "site",
      contactEmail: "<script>@example.com",
      contactPhone: "+92 21 1234567",
      facebookUrl: "javascript:alert(1)",
      instagramUrl: "https://instagram.com/eco",
      xUrl: "http://x.com/eco",
    });
    const c = await getContactSettings();
    expect(c.email).toBe("");
    expect(c.phone).toBe("+92 21 1234567");
    expect(c.socials).toEqual([{ label: "Instagram", url: "https://instagram.com/eco" }]);
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if (!src.includes('requireActionPermission("settings.manage")')) problems.push("missing settings.manage check");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f.startsWith("app/admin/") && !src.includes('requirePermission("settings.manage")')) {
    problems.push("missing page permission check");
  }
  if (f === "components/layout/Footer.js") {
    if (!src.includes('rel="noopener noreferrer"')) problems.push("external links need rel noopener noreferrer");
    if (!src.includes("getContactSettings")) problems.push("footer must read the saved settings");
  }
  if (f === "lib/siteSettings.js" && !src.includes('"https:"')) problems.push("https-only check missing");
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