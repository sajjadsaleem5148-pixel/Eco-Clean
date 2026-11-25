import Link from "next/link";

export const metadata = { title: "Forgot Password | ECO-CLEAN" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-bold text-emerald-900">Forgot your password?</h1>
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Password reset by email is not available yet, because no email service is set up. No reset link can be sent.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        If you are signed in, you can change your password under Settings. If you cannot sign in, please{" "}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link> and a staff
        member will review your request.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/login" className="font-semibold text-emerald-800 underline">Back to log in</Link>
      </p>
    </main>
  );
}
