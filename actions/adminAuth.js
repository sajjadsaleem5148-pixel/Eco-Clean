"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function adminLoginAction(prevState, formData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err; // redirect isi raste se guzarta hai
  }
}
