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
