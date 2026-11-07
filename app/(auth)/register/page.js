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
