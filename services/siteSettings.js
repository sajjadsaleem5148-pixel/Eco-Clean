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
