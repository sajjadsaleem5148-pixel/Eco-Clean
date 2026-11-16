"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import {
  CATEGORY_STATUSES,
  CATEGORY_STATUS_FROM,
  CATEGORY_REASON_REQUIRED,
  isHexColor,
  parseMaterials,
  makeCategoryKey,
} from "@/lib/categoryRules";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid category");

const fields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  description: z.string().trim().max(300, "Description is too long (300 characters maximum)"),
  color: z.string().trim().refine(isHexColor, "Choose a valid colour"),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(fields);
const updateSchema = z.object(Object.assign({ categoryId: objectId }, fields));

function readFields(formData) {
  return {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    color: String(formData.get("color") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

function readMaterials(formData) {
  const accepted = parseMaterials(String(formData.get("acceptedMaterials") || ""));
  if (accepted.error) return { error: "Accepted materials: " + accepted.error };
  const prohibited = parseMaterials(String(formData.get("prohibitedMaterials") || ""));
  if (prohibited.error) return { error: "Materials needing separate disposal: " + prohibited.error };
  return { accepted: accepted.items, prohibited: prohibited.items };
}

function refresh() {
  revalidatePath("/admin/categories");
  revalidatePath("/waste-segregation");
  revalidatePath("/report-garbage");
}

export async function createCategoryAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const materials = readMaterials(formData);
  if (materials.error) return { error: materials.error };
  const d = parsed.data;

  const key = makeCategoryKey(d.name);
  if (!key) return { error: "Name must contain letters or numbers" };

  try {
    await connectDB();
    const created = await WasteCategory.create({
      key: key,
      name: d.name,
      color: d.color.toLowerCase(),
      description: d.description,
      acceptedMaterials: materials.accepted,
      prohibitedMaterials: materials.prohibited,
      sortOrder: d.sortOrder,
      status: "ACTIVE",
    });
    await writeAudit({
      actor: user.id,
      action: "category.create",
      targetType: "WasteCategory",
      targetId: created._id.toString(),
      metadata: { key: key, name: d.name },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A category with this name already exists." };
    console.error("Create category failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Category created. It is active now. Create a points earning rule for it if residents should earn points." };
}

export async function updateCategoryAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const raw = Object.assign({ categoryId: String(formData.get("categoryId") || "") }, readFields(formData));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const materials = readMaterials(formData);
  if (materials.error) return { error: materials.error };
  const d = parsed.data;

  try {
    await connectDB();
    // The key is never changed, so links and rules that refer to it keep working.
    const updated = await WasteCategory.findOneAndUpdate(
      { _id: d.categoryId },
      {
        $set: {
          name: d.name,
          color: d.color.toLowerCase(),
          description: d.description,
          acceptedMaterials: materials.accepted,
          prohibitedMaterials: materials.prohibited,
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Category not found." };

    await writeAudit({
      actor: user.id,
      action: "category.update",
      targetType: "WasteCategory",
      targetId: d.categoryId,
      metadata: { name: d.name },
    });
  } catch (err) {
    console.error("Update category failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Category updated." };
}

const statusSchema = z.object({
  categoryId: objectId,
  target: z.enum(CATEGORY_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

export async function setCategoryStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    categoryId: String(formData.get("categoryId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { categoryId, target, reason } = parsed.data;

  if (CATEGORY_REASON_REQUIRED.includes(target) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a category." };
  }

  try {
    await connectDB();

    if (target === "INACTIVE") {
      const open = await WasteReport.countDocuments({
        category: categoryId,
        deletedAt: null,
        status: { $nin: CLOSED_STATUSES },
      });
      if (open > 0) {
        return {
          error:
            "This category is used by " + open + " open report(s). Finish or close them before deactivating it.",
        };
      }
    }

    const updated = await WasteCategory.findOneAndUpdate(
      { _id: categoryId, status: { $in: CATEGORY_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This category cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "category.status." + target.toLowerCase(),
      targetType: "WasteCategory",
      targetId: categoryId,
      reason: CATEGORY_REASON_REQUIRED.includes(target) ? reason : undefined,
    });
  } catch (err) {
    console.error("Set category status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "INACTIVE" ? "Category deactivated." : "Category reactivated." };
}
