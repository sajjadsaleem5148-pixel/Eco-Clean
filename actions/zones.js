"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { ZONE_STATUSES, ZONE_STATUS_FROM, ZONE_REASON_REQUIRED } from "@/lib/zoneStatus";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid zone");

const zoneFields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().max(500).optional(),
  targetCollectionEveryDays: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Minimum is 1 day")
    .max(30, "Maximum is 30 days"),
};

const createSchema = z.object(zoneFields);
const updateSchema = z.object({ zoneId: objectId, ...zoneFields });

function makeSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function refresh() {
  revalidatePath("/admin/zones");
  revalidatePath("/report-garbage");
}

export async function createZoneAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetCollectionEveryDays: formData.get("targetCollectionEveryDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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

  refresh();
  return { success: "Zone created." };
}

export async function updateZoneAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse({
    zoneId: formData.get("zoneId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetCollectionEveryDays: formData.get("targetCollectionEveryDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    // The slug is never changed, so existing links keep working.
    const updated = await ServiceZone.findOneAndUpdate(
      { _id: d.zoneId, deletedAt: null },
      {
        $set: {
          name: d.name,
          description: d.description || "",
          targetCollectionEveryDays: d.targetCollectionEveryDays,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Zone not found." };

    await writeAudit({
      actor: user.id,
      action: "zone.update",
      targetType: "ServiceZone",
      targetId: d.zoneId,
      metadata: { name: d.name, targetCollectionEveryDays: d.targetCollectionEveryDays },
    });
  } catch (err) {
    console.error("Update zone failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Zone updated." };
}

const statusSchema = z.object({
  zoneId: objectId,
  target: z.enum(ZONE_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

export async function setZoneStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    zoneId: formData.get("zoneId"),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { zoneId, target, reason } = parsed.data;

  if (ZONE_REASON_REQUIRED.includes(target) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a zone." };
  }

  try {
    await connectDB();

    if (target === "INACTIVE") {
      const open = await WasteReport.countDocuments({
        serviceZone: zoneId,
        deletedAt: null,
        status: { $nin: CLOSED_STATUSES },
      });
      if (open > 0) {
        return {
          error:
            "This zone still has " + open + " open report(s). Finish or close them before deactivating the zone.",
        };
      }
    }

    const updated = await ServiceZone.findOneAndUpdate(
      { _id: zoneId, deletedAt: null, status: { $in: ZONE_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This zone cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "zone.status." + target.toLowerCase(),
      targetType: "ServiceZone",
      targetId: zoneId,
      reason: ZONE_REASON_REQUIRED.includes(target) ? reason : undefined,
    });
  } catch (err) {
    console.error("Set zone status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "INACTIVE" ? "Zone deactivated." : "Zone reactivated." };
}
