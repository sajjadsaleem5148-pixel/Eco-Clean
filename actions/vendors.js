"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Vendor from "@/models/Vendor";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_FROM,
  VENDOR_REASON_REQUIRED,
  PHONE_PATTERN,
  isPlainEmail,
  normalizeName,
  nameKeyOf,
  hasContact,
} from "@/lib/vendorRules";

const vendorId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid vendor");

const shared = {
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name is too long")
    .refine((v) => nameKeyOf(v).length > 0, "Name must contain letters or numbers"),
  category: z.enum(Object.keys(VENDOR_CATEGORIES), { message: "Please choose a category" }),
  contactPerson: z.string().trim().max(120, "Contact person is too long"),
  email: z
    .string()
    .trim()
    .max(200, "Email is too long")
    .refine((v) => v === "" || isPlainEmail(v), "Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(25, "Phone number is too long")
    .refine((v) => v === "" || PHONE_PATTERN.test(v), "Enter a valid phone number"),
  address: z.string().trim().max(300, "Address is too long (300 characters maximum)"),
  notes: z.string().trim().max(300, "Notes are too long (300 characters maximum)"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ vendorId: vendorId }, shared));

function readFields(formData) {
  return {
    name: String(formData.get("name") || ""),
    category: formData.get("category"),
    contactPerson: String(formData.get("contactPerson") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    address: String(formData.get("address") || ""),
    notes: String(formData.get("notes") || ""),
  };
}

function refresh() {
  revalidatePath("/admin/vendors");
}

export async function createVendorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const created = await Vendor.create({
      name: normalizeName(d.name),
      nameKey: nameKeyOf(d.name),
      category: d.category,
      contactPerson: d.contactPerson,
      email: d.email.toLowerCase(),
      phone: d.phone,
      address: d.address,
      notes: d.notes,
      status: "PENDING",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "vendor.create",
      targetType: "Vendor",
      targetId: created._id.toString(),
      metadata: { name: created.name, category: d.category },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A vendor with this name already exists." };
    console.error("Create vendor failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vendor added as pending. Approve it when its details are checked." };
}

export async function updateVendorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ vendorId: String(formData.get("vendorId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const updated = await Vendor.findOneAndUpdate(
      { _id: d.vendorId, deletedAt: null },
      {
        $set: {
          name: normalizeName(d.name),
          nameKey: nameKeyOf(d.name),
          category: d.category,
          contactPerson: d.contactPerson,
          email: d.email.toLowerCase(),
          phone: d.phone,
          address: d.address,
          notes: d.notes,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Vendor not found." };

    await writeAudit({
      actor: user.id,
      action: "vendor.update",
      targetType: "Vendor",
      targetId: d.vendorId,
      metadata: { name: normalizeName(d.name) },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A vendor with this name already exists." };
    console.error("Update vendor failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vendor updated." };
}

const statusSchema = z.object({
  vendorId: vendorId,
  target: z.enum(VENDOR_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long (300 characters maximum)").optional(),
});

export async function setVendorStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    vendorId: String(formData.get("vendorId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { vendorId: id, target, reason } = parsed.data;

  if (!VENDOR_STATUS_FROM[target]) return { error: "This vendor cannot be moved to that status." };

  const needsReason = VENDOR_REASON_REQUIRED.includes(target);
  if (needsReason && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a vendor." };
  }

  try {
    await connectDB();

    const filter = { _id: id, deletedAt: null, status: { $in: VENDOR_STATUS_FROM[target] } };
    let update;
    if (target === "APPROVED") {
      const vendor = await Vendor.findOne({ _id: id, deletedAt: null }).select("email phone").lean();
      if (!vendor) return { error: "Vendor not found." };
      if (!hasContact(vendor)) return { error: "Add an email or a phone number before approving this vendor." };
      // The contact check is part of the update filter too, so it cannot be skipped by a race.
      filter.$or = [{ email: { $exists: true, $ne: "" } }, { phone: { $exists: true, $ne: "" } }];
      update = {
        $set: { status: "APPROVED", approvedBy: user.id, approvedAt: new Date() },
        $unset: { statusReason: "" },
      };
    } else {
      update = { $set: { status: target, statusReason: reason } };
    }

    const updated = await Vendor.findOneAndUpdate(filter, update, { returnDocument: "after" }).select("_id");
    if (!updated) return { error: "This vendor cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "vendor.status." + target.toLowerCase(),
      targetType: "Vendor",
      targetId: id,
      reason: needsReason ? reason : undefined,
    });
  } catch (err) {
    console.error("Set vendor status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "APPROVED" ? "Vendor approved." : "Vendor deactivated." };
}
