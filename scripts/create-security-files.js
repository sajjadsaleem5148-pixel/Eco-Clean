const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("models/RateLimit.js", `
import mongoose from "mongoose";

const rateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true },
  windowStart: { type: Date, required: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});

rateLimitSchema.index({ key: 1, windowStart: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit || mongoose.model("RateLimit", rateLimitSchema);
`);

write("lib/security/rateLimit.js", `
import crypto from "node:crypto";
import { headers } from "next/headers";
import connectDB from "@/lib/db/connect";
import RateLimit from "@/models/RateLimit";

export async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") || "unknown";
}

export function makeKey(prefix, value) {
  return prefix + ":" + crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

export async function hit(key, limit, windowSeconds) {
  await connectDB();
  const ms = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / ms) * ms);
  const expiresAt = new Date(windowStart.getTime() + ms * 2);

  async function bump() {
    return RateLimit.findOneAndUpdate(
      { key, windowStart },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, new: true }
    );
  }

  let doc;
  try {
    doc = await bump();
  } catch (err) {
    if (err && err.code === 11000) doc = await bump();
    else throw err;
  }
  return { ok: doc.count <= limit, count: doc.count };
}
`);

write("lib/security/stepUp.js", `
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { hit, makeKey } from "@/lib/security/rateLimit";

export async function verifyCurrentPassword(userId, password) {
  if (!password) return { ok: false, reason: "INVALID" };
  const rl = await hit(makeKey("stepup", userId), 10, 15 * 60);
  if (!rl.ok) return { ok: false, reason: "LIMITED" };

  await connectDB();
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user) return { ok: false, reason: "INVALID" };
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? { ok: true } : { ok: false, reason: "INVALID" };
}
`);

write("lib/auth/home.js", `
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

export function homeForRole(role) {
  if (role === "RESIDENT") return "/dashboard";
  if (role === "COLLECTOR") return "/collector";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/";
}

export async function getRoleByEmail(email) {
  await connectDB();
  const user = await User.findOne({ email, deletedAt: null }).select("role").lean();
  return user ? user.role : null;
}
`);

write("actions/auth.js", `
"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { ROLES } from "@/lib/permissions/roles";
import { hit, makeKey, getClientIp } from "@/lib/security/rateLimit";
import { homeForRole, getRoleByEmail } from "@/lib/auth/home";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(72, "Password must be 72 characters or fewer"),
});

export async function registerAction(prevState, formData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const ip = await getClientIp();
    const limit = await hit(makeKey("register-ip", ip), 10, 60 * 60);
    if (!limit.ok) return { error: "Too many sign-ups from this network. Please try again later." };

    await connectDB();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: ROLES.RESIDENT,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return { error: "Registration could not be completed. If you already have an account, please log in." };
    }
    console.error("Register failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  redirect("/login?registered=1");
}

export async function loginAction(prevState, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Please enter your email and password." };

  let role = null;
  try {
    const ip = await getClientIp();
    const [byEmail, byIp] = await Promise.all([
      hit(makeKey("login-email", email), 10, 15 * 60),
      hit(makeKey("login-ip", ip), 30, 15 * 60),
    ]);
    if (!byEmail.ok || !byIp.ok) {
      return { error: "Too many login attempts. Please try again in 15 minutes." };
    }

    try {
      await signIn("credentials", { email, password, redirect: false });
    } catch (err) {
      if (err instanceof AuthError) return { error: "Incorrect email or password." };
      throw err;
    }
    role = await getRoleByEmail(email);
  } catch (err) {
    console.error("Login failed:", err.message);
    return { error: "Login is temporarily unavailable. Please try again." };
  }

  redirect(homeForRole(role));
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
`);

write("actions/adminAuth.js", `
"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import { hit, makeKey, getClientIp } from "@/lib/security/rateLimit";
import { getRoleByEmail } from "@/lib/auth/home";

export async function adminLoginAction(prevState, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Please enter your email and password." };

  try {
    const ip = await getClientIp();
    const [byEmail, byIp] = await Promise.all([
      hit(makeKey("login-email", email), 10, 15 * 60),
      hit(makeKey("login-ip", ip), 30, 15 * 60),
    ]);
    if (!byEmail.ok || !byIp.ok) {
      return { error: "Too many login attempts. Please try again in 15 minutes." };
    }

    try {
      await signIn("credentials", { email, password, redirect: false });
    } catch (err) {
      if (err instanceof AuthError) return { error: "Incorrect email or password." };
      throw err;
    }

    const role = await getRoleByEmail(email);
    if (!ADMIN_ROLES.includes(role)) {
      await signOut({ redirect: false });
      return { error: "Incorrect email or password." };
    }
  } catch (err) {
    console.error("Admin login failed:", err.message);
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }

  redirect("/admin");
}
`);

write("actions/security.js", `
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
`);

write("actions/collectors.js", `
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
  serviceZone: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a zone"),
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
`);

write("components/forms/CollectorForm.js", `
"use client";

import { useActionState } from "react";
import { createCollectorAction } from "@/actions/collectors";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function CollectorForm({ zones }) {
  const [state, formAction, pending] = useActionState(createCollectorAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label htmlFor="serviceZone" className="mb-1 block text-sm font-medium">Service zone</label>
        <select id="serviceZone" name="serviceZone" required defaultValue="" className={field}>
          <option value="" disabled>Select a zone</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Temporary password for the collector (at least 12 characters)
        </label>
        <input id="password" name="password" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      <div>
        <label htmlFor="adminPassword" className="mb-1 block text-sm font-medium">
          Your own password (to confirm this action)
        </label>
        <input id="adminPassword" name="adminPassword" type="password" required
          autoComplete="current-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Creating..." : "Create collector"}
      </button>
    </form>
  );
}
`);

write("components/forms/ChangePasswordForm.js", `
"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/security";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" required
          autoComplete="current-password" className={field} />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">New password (at least 12 characters)</label>
        <input id="newPassword" name="newPassword" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      <p className="text-xs text-gray-600">After a password change you will be signed out everywhere and must log in again.</p>
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
`);

write("app/(auth)/login/page.js", `
import Link from "next/link";
import LoginForm from "@/components/forms/LoginForm";

export const metadata = { title: "Login | ECO-CLEAN" };

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-emerald-900">ECO-CLEAN Login</h1>
      {params?.registered && (
        <p role="status" className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Account created. Please log in.
        </p>
      )}
      {params?.changed && (
        <p role="status" className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          Your password was changed. Please log in with the new password.
        </p>
      )}
      <LoginForm />
      <p className="mt-4 text-sm">
        New here? <Link href="/register" className="font-semibold text-emerald-800 underline">Register</Link>
      </p>
    </main>
  );
}
`);

write("app/dashboard/settings/page.js", `
import { requireRole } from "@/lib/auth/guards";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "Settings | ECO-CLEAN" };

export default async function ResidentSettingsPage() {
  const user = await requireRole(["RESIDENT"]);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user.email}</p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
`);

write("app/collector/profile/page.js", `
import { requireRole } from "@/lib/auth/guards";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "My Profile | ECO-CLEAN" };

export default async function CollectorProfilePage() {
  const user = await requireRole(["COLLECTOR"]);
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="mt-2 text-sm text-gray-700">Name: {user.name}</p>
        <p className="text-sm text-gray-700">Email: {user.email}</p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-lg font-semibold">Change password</h2>
        <p className="mb-4 text-sm text-gray-600">
          If you received a temporary password from an administrator, please change it now.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/security/page.js", `
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import ChangePasswordForm from "@/components/forms/ChangePasswordForm";

export const metadata = { title: "My Security | ECO-CLEAN" };

export default async function AdminSecurityPage() {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Security</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user.email} ({user.role})</p>
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Multi-factor authentication is not configured yet.
        </p>
      </section>
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
`);

console.log("\nSab security files ban gayin.");