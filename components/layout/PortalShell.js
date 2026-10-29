import Link from "next/link";
import { Menu } from "lucide-react";
import LogoutButton from "@/components/forms/LogoutButton";

function NavList({ groups }) {
  return (
    <nav aria-label="Section navigation">
      {groups.map((group, i) => (
        <div key={group.title || i} className="mb-4">
          {group.title && (
            <p className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">{group.title}</p>
          )}
          <ul>
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-md px-2 py-2 text-sm text-gray-800 hover:bg-emerald-50">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function PortalShell({ title, groups, children }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between gap-3 bg-emerald-900 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <details className="relative md:hidden">
            <summary
              aria-label="Open navigation"
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-emerald-300"
            >
              <Menu size={20} aria-hidden="true" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-gray-900">
              <NavList groups={groups} />
            </div>
          </details>
          <Link href="/" className="font-bold">ECO-CLEAN</Link>
          <span className="text-sm text-emerald-100">{title}</span>
        </div>
        <LogoutButton />
      </header>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-64 shrink-0 self-start border-r border-gray-200 bg-white p-3 md:sticky md:top-0 md:block md:max-h-screen md:overflow-y-auto">
          <NavList groups={groups} />
        </aside>
        <div className="min-w-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
