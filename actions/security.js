"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { signOut } from "@/auth";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/security/stepUp";
import { writeAudit } from "@/lib/audit/log";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password").max(200),
    newPassword: z
      .string()
      .min(12, "New password must be at least 12 characters")
      .max(72, "New password must be 72 characters or fewer"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export async function changePasswordAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const check = await verifyCurrentPassword(user.id, parsed.data.currentPassword);
    if (!check.ok) {
      return {
        error:
          check.reason === "LIMITED"
            ? "Too many attempts. Please try again in 15 minutes."
            : "Your current password is incorrect.",
      };
    }

    await connectDB();
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await User.updateOne({ _id: user.id }, { $set: { passwordHash }, $inc: { sessionVersion: 1 } });

    await writeAudit({
      actor: user.id,
      action: "user.password_change",
      targetType: "User",
      targetId: user.id,
    });
  } catch (err) {
    console.error("Change password failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  await signOut({ redirectTo: "/login?changed=1" });
}
