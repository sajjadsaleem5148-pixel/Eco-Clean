"use client";

import Link from "next/link";
import { Bell, UserCircle } from "lucide-react";

export default function AdminHeader() {
  return (
    <header className="fixed left-64 right-0 top-0 z-30 h-16 border-b border-gray-200 bg-white">
      <div className="flex h-full items-center justify-between px-6">
        
        {/* Page Title */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Admin Dashboard
          </h2>

          <p className="text-xs text-gray-500">
            Manage EcoClean System
          </p>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          
          {/* Notifications */}
          <Link
            href="/admin/notifications"
            className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100"
          >
            <Bell size={21} />

            {/* Notification Badge */}
            <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500"></span>
          </Link>

          {/* Admin Profile */}
          <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
            <UserCircle
              size={38}
              className="text-gray-400"
            />

            <div>
              <p className="text-sm font-semibold text-gray-800">
                Admin
              </p>

              <p className="text-xs text-gray-500">
                Administrator
              </p>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}