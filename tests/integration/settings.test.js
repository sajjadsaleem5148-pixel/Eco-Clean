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
