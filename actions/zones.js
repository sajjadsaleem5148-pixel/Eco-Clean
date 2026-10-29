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
