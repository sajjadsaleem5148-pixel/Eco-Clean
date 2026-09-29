"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Users,
  UserRoundCog,
  CalendarDays,
  MessageSquareWarning,
  MapPin,
  Recycle,
  BarChart3,
  Settings,
  Leaf,
} from "lucide-react";

const menuItems = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Pickups",
    href: "/admin/pickups",
    icon: Truck,
  },
  {
    name: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    name: "Collectors",
    href: "/admin/collectors",
    icon: UserRoundCog,
  },
  {
    name: "Schedules",
    href: "/admin/schedules",
    icon: CalendarDays,
  },
  {
    name: "Complaints",
    href: "/admin/complaints",
    icon: MessageSquareWarning,
  },
  {
    name: "Locations",
    href: "/admin/locations",
    icon: MapPin,
  },
  {
    name: "Waste Types",
    href: "/admin/waste-types",
    icon: Recycle,
  },
  {
    name: "Reports",
    href: "/admin/reports",
    icon: BarChart3,
  },
  {
    name: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
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
            Admin Panel
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Management
        </p>

        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;

            const isActive =
              item.href === "/admin"
                ? pathname === "/admin"
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

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-4">
        <div className="rounded-lg bg-green-50 p-3">
          <div className="flex items-center gap-2">
            <Leaf size={18} className="text-green-600" />

            <span className="text-sm font-semibold text-green-800">
              EcoClean
            </span>
          </div>

          <p className="mt-1 text-xs text-green-700">
            Smart Waste Management
          </p>
        </div>
      </div>
    </aside>
  );
}