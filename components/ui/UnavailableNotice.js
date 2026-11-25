import Link from "next/link";

export default function UnavailableNotice({ title, what }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {what} Business accounts are not available yet, so there is nothing to show here.
      </p>
      <p className="mt-4 text-sm text-gray-800">
        If your organisation would like to work with ECO-CLEAN, please{" "}
        <Link href="/contact" className="font-semibold text-emerald-800 underline">contact us</Link>.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/" className="font-semibold text-emerald-800 underline">Back to the home page</Link>
      </p>
    </section>
  );
}
