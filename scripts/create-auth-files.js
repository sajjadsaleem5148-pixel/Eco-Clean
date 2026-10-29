const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("auth.js", `
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;

        await connectDB();
        const user = await User.findOne({
          email: parsed.data.email,
          deletedAt: null,
        }).select("+passwordHash");

        if (!user || user.status !== "ACTIVE") return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.sessionVersion = token.sessionVersion;
      return session;
    },
  },
});
`);

write("app/api/auth/[...nextauth]/route.js", `
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
`);

write("lib/auth/session.js", `
import { auth } from "@/auth";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";

// Role aur status hamesha database se aate hain, cookie par bharosa nahi.
export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  await connectDB();
  const user = await User.findById(id).lean();
  if (!user || user.deletedAt || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== session.user.sessionVersion) return null;

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
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
`);

write("components/forms/RegisterForm.js", `
"use client";

import { useActionState } from "react";
import { registerAction } from "@/actions/auth";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Poora naam</label>
        <input id="name" name="name" type="text" required autoComplete="name"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password (kam az kam 10 characters)</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Account ban raha hai..." : "Account banayen"}
      </button>
    </form>
  );
}
`);

write("components/forms/LoginForm.js", `
"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Login ho raha hai..." : "Login"}
      </button>
    </form>
  );
}
`);

write("components/forms/LogoutButton.js", `
import { logoutAction } from "@/actions/auth";

export default function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit"
        className="min-h-11 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">
        Logout
      </button>
    </form>
  );
}
`);

write("app/(auth)/register/page.js", `
import Link from "next/link";
import RegisterForm from "@/components/forms/RegisterForm";

export const metadata = { title: "Register | ECO-CLEAN" };

export default function RegisterPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-emerald-900">ECO-CLEAN par register karein</h1>
      <RegisterForm />
      <p className="mt-4 text-sm">
        Pehle se account hai? <Link href="/login" className="font-semibold text-emerald-800 underline">Login</Link>
      </p>
    </main>
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
          Account ban gaya. Ab login karein.
        </p>
      )}
      <LoginForm />
      <p className="mt-4 text-sm">
        Naya account? <Link href="/register" className="font-semibold text-emerald-800 underline">Register</Link>
      </p>
    </main>
  );
}
`);

write("app/dashboard/page.js", `
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LogoutButton from "@/components/forms/LogoutButton";

export const metadata = { title: "Dashboard | ECO-CLEAN" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "RESIDENT") redirect("/");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-emerald-900">Khush amdeed, {user.name}</h1>
      <p className="mt-2 text-sm text-gray-700">Email: {user.email}</p>
      <p className="text-sm text-gray-700">Role: {user.role}</p>
      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
`);

console.log("\nSab auth files ban gayin.");