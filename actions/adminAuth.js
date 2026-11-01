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
