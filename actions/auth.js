"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { ROLES } from "@/lib/permissions/roles";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Naam kam az kam 2 harf ka ho").max(120),
  email: z.string().trim().toLowerCase().email("Sahi email likhein"),
  password: z
    .string()
    .min(10, "Password kam az kam 10 characters ka ho")
    .max(72, "Password 72 characters se chhota ho"),
});

export async function registerAction(prevState, formData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await connectDB();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    // Role server khud tay karta hai. Form se kabhi nahi aata.
    await User.create({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: ROLES.RESIDENT,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return {
        error:
          "Registration mukammal nahi ho saki. Agar aap pehle register hain to login karein.",
      };
    }
    console.error("Register failed:", err.message);
    return { error: "Kuch masla aa gaya. Dobara koshish karein." };
  }

  redirect("/login?registered=1");
}

export async function loginAction(prevState, formData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email ya password ghalat hai." };
    }
    throw err; // redirect bhi yahin se guzarta hai, isay rokna nahi
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
