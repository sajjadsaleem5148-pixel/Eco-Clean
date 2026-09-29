"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  CalendarDays,
  User,
  Bell,
  Leaf,
  LogOut,
} from "lucide-react";

const menuItems = [
  {
    name: "Dashboard",
    href: "/collector",
    icon: LayoutDashboard,
  },
  {
    name: "My Pickups",
    href: "/collector/pickups",
    icon: Truck,
  },
  {
    name: "Schedule",
    href: "/collector/schedule",
    icon: CalendarDays,
  },
  {
    name: "Profile",
    href: "/collector/profile",
    icon: User,
  },
  {
    name: "Notifications",
    href: "/collector/notifications",
    icon: Bell,
  },
];

export default function CollectorLayout({ children }) {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-gray-200 bg-white md:block">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white">
            <Leaf size={22} />
          </div>

          <div>
            <h1 className="text-lg font-bold text-gray-800">
              EcoClean
            </h1>

            <p className="text-xs text-gray-500">
              Collector Panel
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Collection
          </p>

          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;

              const isActive =
                item.href === "/collector"
                  ? pathname === "/collector"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-green-50 text-green-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-green-700"
                  }`}
                >
                  <Icon size={19} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <LogOut size={19} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-5 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white">
            <Leaf size={19} />
          </div>

          <div>
            <p className="font-bold text-gray-800">
              EcoClean
            </p>

            <p className="text-[10px] text-gray-500">
              Collector Panel
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg p-2 text-red-600 hover:bg-red-50"
        >
          <LogOut size={19} />
        </button>
      </header>

      {/* Main Content */}
      <main className="min-h-screen md:ml-64">
        <div className="p-5 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}