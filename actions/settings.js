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
