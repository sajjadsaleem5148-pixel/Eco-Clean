import Link from "next/link";

export default function AuthShell({ label, children }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between bg-emerald-900 px-4 py-3 text-white">
        <Link href="/" className="font-bold">ECO-CLEAN</Link>
        <span className="text-sm text-emerald-100">{label}</span>
      </header>
      {children}
    </div>
  );
}
