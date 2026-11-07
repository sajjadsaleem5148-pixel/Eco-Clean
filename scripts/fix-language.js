const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "components/forms/RegisterForm.js",
  "components/forms/LoginForm.js",
  "app/(auth)/register/page.js",
  "lib/db/connect.js",
  "models/AuditLog.js",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const touched = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  touched.push(file);
  console.log("Written:", file);
}

function patch(file, oldText, newText) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes(oldText)) {
    fs.writeFileSync(file, src.replace(oldText, newText), "utf8");
    touched.push(file);
    console.log("Patched:", file);
  } else if (src.includes(newText)) {
    console.log("Already English:", file);
  } else {
    console.log("WARNING: expected text not found in " + file + " (check it manually)");
  }
}

write("components/forms/RegisterForm.js", `
"use client";

import { useActionState } from "react";
import { registerAction } from "@/actions/auth";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="name" name="name" type="text" required maxLength={120} autoComplete="name" className={field} />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password (at least 10 characters)</label>
        <input id="password" name="password" type="password" required minLength={10} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
`);

write("components/forms/LoginForm.js", `
"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Signing in..." : "Log in"}
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
      <h1 className="mb-6 text-2xl font-bold text-emerald-900">Create your ECO-CLEAN account</h1>
      <RegisterForm />
      <p className="mt-4 text-sm">
        Already have an account? <Link href="/login" className="font-semibold text-emerald-800 underline">Log in</Link>
      </p>
    </main>
  );
}
`);

patch("lib/db/connect.js", "MONGODB_URI .env.local mein set nahi hai", "MONGODB_URI is not set in .env.local");
patch(
  "lib/db/connect.js",
  "// Development workaround: kuch ISP/router DNS SRV records resolve nahi karte",
  "// Development workaround: some ISP/router DNS servers cannot resolve SRV records"
);
patch(
  "models/AuditLog.js",
  '"AuditLog append-only hai: " + op + " allowed nahi"',
  '"AuditLog is append-only: " + op + " is not allowed"'
);

let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|mein|hai|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
touched.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (empty): " + f);
    failed++;
  } else if (romanUrdu.test(src)) {
    console.log(" FAIL (Roman Urdu still present): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + touched.length + " files updated and checked.");