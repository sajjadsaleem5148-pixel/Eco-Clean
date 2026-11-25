import Link from "next/link";

export const metadata = { title: "Reset Password | ECO-CLEAN" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Reset password</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Reset links are not available yet, because no email service is set up. A link you received from this site
        cannot be used to reset a password.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        Please <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link> for help
        with your account.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-emerald-800 underline">Back to log in</Link>
      </p>
    </main>
  );
}
