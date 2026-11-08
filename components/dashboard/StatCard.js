import Link from "next/link";

export default function StatCard({ label, value, href, linkLabel = "Open" }) {
  const missing = value === null || value === undefined;
  return (
    <li className="rounded-lg border border-gray-200 border-l-4 border-l-emerald-700 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-emerald-950">
        {missing ? "-" : value}
        {missing && <span className="sr-only">not available</span>}
      </p>
      {href && (
        <Link href={href} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">
          {linkLabel}
        </Link>
      )}
    </li>
  );
}
