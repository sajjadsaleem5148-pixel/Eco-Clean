import Link from "next/link";

export const metadata = { title: "Staff Password Help | ECO-CLEAN" };

export default function AdminForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Staff password help</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Password reset by email is not available yet, because no email service is set up.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        Ask another administrator, or the person who runs the server, to reset your password. When you are signed in you
        can change it under My Security.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/admin/login" className="font-semibold text-emerald-800 underline">Back to staff log in</Link>
      </p>
    </main>
  );
}
