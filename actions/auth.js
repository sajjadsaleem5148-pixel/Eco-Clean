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
