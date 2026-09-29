"use client";

import { useState } from "react";
import {
  Settings,
  Bell,
  ShieldCheck,
  Globe,
  Save,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    siteName: "EcoClean",
    emailNotifications: true,
    pickupNotifications: true,
    complaintNotifications: true,
    maintenanceMode: false,
  });

  const handleChange = (field) => {
    setSettings((previous) => ({
      ...previous,
      [field]: !previous[field],
    }));
  };

  const handleSave = () => {
    console.log("Settings:", settings);

    alert("Settings saved successfully!");
  };

  return (
    <div>
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Settings
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Manage EcoClean admin and system settings
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <Globe size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-gray-800">
                General Settings
              </h2>

              <p className="text-xs text-gray-500">
                Basic website configuration
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Website Name
            </label>

            <input
              type="text"
              value={settings.siteName}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  siteName: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Notification Settings */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Bell size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-gray-800">
                Notifications
              </h2>

              <p className="text-xs text-gray-500">
                Manage system notifications
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {/* Email Notifications */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Email Notifications
                </p>

                <p className="text-xs text-gray-500">
                  Receive important system emails
                </p>
              </div>

              <input
                type="checkbox"
                checked={settings.emailNotifications}
                onChange={() =>
                  handleChange("emailNotifications")
                }
                className="h-4 w-4 accent-green-600"
              />
            </label>

            {/* Pickup Notifications */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Pickup Notifications
                </p>

                <p className="text-xs text-gray-500">
                  Notify users about pickup updates
                </p>
              </div>

              <input
                type="checkbox"
                checked={settings.pickupNotifications}
                onChange={() =>
                  handleChange("pickupNotifications")
                }
                className="h-4 w-4 accent-green-600"
              />
            </label>

            {/* Complaint Notifications */}
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Complaint Notifications
                </p>

                <p className="text-xs text-gray-500">
                  Notify admins about new complaints
                </p>
              </div>

              <input
                type="checkbox"
                checked={settings.complaintNotifications}
                onChange={() =>
                  handleChange("complaintNotifications")
                }
                className="h-4 w-4 accent-green-600"
              />
            </label>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <ShieldCheck size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-gray-800">
                Security
              </h2>

              <p className="text-xs text-gray-500">
                Admin security settings
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-gray-700">
              Authentication
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Admin authentication will use JWT authentication.
            </p>
          </div>
        </div>

        {/* System Settings */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
              <Settings size={20} />
            </div>

            <div>
              <h2 className="font-semibold text-gray-800">
                System
              </h2>

              <p className="text-xs text-gray-500">
                Control system availability
              </p>
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Maintenance Mode
              </p>

              <p className="text-xs text-gray-500">
                Temporarily disable public services
              </p>
            </div>

            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={() =>
                handleChange("maintenanceMode")
              }
              className="h-4 w-4 accent-green-600"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <Save size={18} />
          Save Settings
        </button>
      </div>
    </div>
  );
}