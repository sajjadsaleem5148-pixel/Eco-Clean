"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { verifyCurrentPassword } from "@/lib/security/stepUp";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { STAFF_ROLES } from "@/lib/userAdmin";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid account");

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/admin-staff");
  revalidatePath("/admin/collectors");
}

function stepUpError(check) {
  return check.reason === "LIMITED"
    ? "Too many attempts. Please try again in 15 minutes."
    : "Your password is incorrect.";
}

const reasonField = z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300);
const passwordField = z.string().min(1, "Please enter your own password to confirm").max(200);

const suspendSchema = z.object({
  userId: objectId,
  reason: reasonField,
  adminPassword: passwordField,
});

export async function suspendUserAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("users.suspend");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.userId === admin.id) return { error: "You cannot suspend your own account." };

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role isRootAdmin");
    if (!target) return { error: "Account not found." };
    if (target.isRootAdmin || target.role === "SUPER_ADMIN") {
      return { error: "Super Admin accounts cannot be suspended here." };
    }
    if (ADMIN_ROLES.includes(target.role) && !hasPermission(admin.role, "admins.manage")) {
      return { error: "You do not have permission to suspend staff accounts." };
    }

    // Filter mein hifazat dobara: root/super admin kabhi match nahi honge.
    const updated = await User.findOneAndUpdate(
      {
        _id: d.userId,
        deletedAt: null,
        status: "ACTIVE",
        isRootAdmin: { $ne: true },
        role: { $ne: "SUPER_ADMIN" },
      },
      {
        $set: { status: "SUSPENDED", suspensionReason: d.reason },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account cannot be suspended. It may already be suspended." };

    await writeAudit({
      actor: admin.id,
      action: "user.suspend",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
    });
  } catch (err) {
    console.error("Suspend user failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Account suspended. Their sessions were ended." };
}

export async function reactivateUserAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("users.suspend");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role");
    if (!target) return { error: "Account not found." };
    if (ADMIN_ROLES.includes(target.role) && !hasPermission(admin.role, "admins.manage")) {
      return { error: "You do not have permission to reactivate staff accounts." };
    }

    const updated = await User.findOneAndUpdate(
      { _id: d.userId, deletedAt: null, status: "SUSPENDED" },
      {
        $set: { status: "ACTIVE" },
        $unset: { suspensionReason: "" },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account is not suspended." };

    await writeAudit({
      actor: admin.id,
      action: "user.reactivate",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
    });
  } catch (err) {
    console.error("Reactivate user failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Account reactivated." };
}

const staffSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  role: z.enum(STAFF_ROLES, { message: "Please choose a role" }),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
  adminPassword: passwordField,
});

export async function createStaffAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("admins.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = staffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const passwordHash = await bcrypt.hash(d.password, 12);
    const created = await User.create({
      name: d.name,
      email: d.email,
      passwordHash,
      role: d.role,
    });

    await writeAudit({
      actor: admin.id,
      action: "staff.create",
      targetType: "User",
      targetId: created._id.toString(),
      metadata: { role: d.role },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "An account with this email may already exist." };
    console.error("Create staff failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Staff account created. Share the temporary password with them securely." };
}

const roleSchema = z.object({
  userId: objectId,
  role: z.enum(STAFF_ROLES, { message: "Please choose a role" }),
  reason: reasonField,
  adminPassword: passwordField,
});

export async function changeStaffRoleAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("admins.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.userId === admin.id) return { error: "You cannot change your own role." };

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role");
    if (!target) return { error: "Account not found." };
    if (!STAFF_ROLES.includes(target.role)) {
      return { error: "Only existing staff accounts (not Super Admin) can have their role changed here." };
    }
    if (target.role === d.role) return { error: "This account already has that role." };

    const updated = await User.findOneAndUpdate(
      {
        _id: d.userId,
        deletedAt: null,
        isRootAdmin: { $ne: true },
        role: target.role,
      },
      { $set: { role: d.role }, $inc: { sessionVersion: 1 } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account was updated by someone else. Please reload and try again." };

    await writeAudit({
      actor: admin.id,
      action: "staff.role_change",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
      metadata: { from: target.role, to: d.role },
    });
  } catch (err) {
    console.error("Change staff role failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Role changed. Their sessions were ended." };
}
