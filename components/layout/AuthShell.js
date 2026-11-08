import Link from "next/link";

export default function AuthShell({ label, children }) {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="flex items-center justify-between bg-emerald-950 px-4 py-3 text-white">
        <Link href="/" className="text-lg font-bold tracking-tight">ECO-CLEAN</Link>
        <span className="text-sm text-emerald-100">{label}</span>
      </header>
      <div className="mx-auto mt-8 max-w-lg rounded-lg border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  );
}
