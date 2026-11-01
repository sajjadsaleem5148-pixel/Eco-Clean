"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import ServiceZone from "@/models/ServiceZone";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { ROLES } from "@/lib/permissions/roles";
import { verifyCurrentPassword } from "@/lib/security/stepUp";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
  serviceZone: z.string().regex(/^[a-f\d]{24}$/i, "Please choose a zone"),
  adminPassword: z.string().min(1, "Please enter your own password to confirm").max(200),
});

export async function createCollectorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    serviceZone: formData.get("serviceZone"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(user.id, d.adminPassword);
    if (!check.ok) {
      return {
        error:
          check.reason === "LIMITED"
            ? "Too many attempts. Please try again in 15 minutes."
            : "Your password is incorrect.",
      };
    }

    await connectDB();
    const zone = await ServiceZone.findOne({ _id: d.serviceZone, status: "ACTIVE", deletedAt: null }).select("_id").lean();
    if (!zone) return { error: "The selected zone is not available." };

    const passwordHash = await bcrypt.hash(d.password, 12);
    const created = await User.create({
      name: d.name,
      email: d.email,
      passwordHash,
      role: ROLES.COLLECTOR,
      serviceZone: zone._id,
    });

    await writeAudit({
      actor: user.id,
      action: "collector.create",
      targetType: "User",
      targetId: created._id.toString(),
      metadata: { zone: d.serviceZone },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return { error: "An account with this email may already exist." };
    }
    console.error("Create collector failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/admin/collectors");
  return { success: "Collector account created. Share the temporary password with them securely." };
}
