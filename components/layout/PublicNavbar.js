import Link from "next/link";
import { Menu, ShieldCheck } from "lucide-react";
import { publicNav } from "@/lib/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

async function safeUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function homeFor(role) {
  if (role === "RESIDENT") return "/dashboard";
  if (role === "COLLECTOR") return "/collector";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/";
}

export default async function PublicNavbar() {
  const user = await safeUser();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-900">
          ECO-CLEAN
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 text-sm lg:flex">
          {publicNav.map((item) => (
            <Link key={item.href} href={item.href} className="text-gray-800 hover:text-emerald-800">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href={homeFor(user.role)}
              className="hidden min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:inline-flex"
            >
              My account
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden min-h-11 items-center px-3 text-sm font-semibold text-emerald-900 sm:inline-flex">
                Login
              </Link>
              <Link
                href="/register"
                className="hidden min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:inline-flex"
              >
                Register
              </Link>
            </>
          )}

          <Link
            href="/admin/login"
            aria-label="Admin sign-in"
            title="Admin sign-in"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-emerald-900 hover:bg-emerald-50"
          >
            <ShieldCheck size={20} aria-hidden="true" />
          </Link>

          <details className="relative lg:hidden">
            <summary
              aria-label="Open menu"
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-gray-300"
            >
              <Menu size={20} aria-hidden="true" />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-gray-200 bg-white p-2">
              {publicNav.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-md px-3 py-3 text-sm text-gray-900 hover:bg-emerald-50">
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-gray-200 pt-2">
                {user ? (
                  <Link href={homeFor(user.role)} className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">
                    My account
                  </Link>
                ) : (
                  <>
                    <Link href="/login" className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">Login</Link>
                    <Link href="/register" className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">Register</Link>
                  </>
                )}
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
