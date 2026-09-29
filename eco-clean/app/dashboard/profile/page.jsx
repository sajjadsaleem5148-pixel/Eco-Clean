"use client";

import { useEffect, useState } from "react";
import {
  UserCircle,
  Mail,
  Phone,
  MapPin,
  Save,
} from "lucide-react";

import api from "@/lib/api";

export default function ProfilePage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User profile load karna
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          setLoading(false);
          return;
        }

        const response = await api.get("/users/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const user = response.data.user;

        setFormData({
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          address: user?.address || "",
        });
      } catch (error) {
        console.error(
          "Profile load error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Profile update karna
  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);

      const token = localStorage.getItem("token");

      const response = await api.put(
        "/users/profile",
        {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Updated user localStorage mein save karna
      if (response.data.user) {
        localStorage.setItem(
          "user",
          JSON.stringify(response.data.user)
        );
      }

      alert("Profile updated successfully!");
    } catch (error) {
      console.error(
        "Profile update error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Profile update failed."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          My Profile
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          View and update your personal information.
        </p>
      </div>

      {loading ? (
        /* Loading */
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading profile...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Profile Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-green-50 text-green-600">
              <UserCircle size={64} />
            </div>

            <h2 className="mt-5 text-xl font-bold text-gray-800">
              {formData.name || "User"}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Citizen
            </p>

            <div className="mt-5 border-t border-gray-100 pt-5 text-left">
              <div className="flex items-center gap-3">
                <Mail size={17} className="text-gray-400" />

                <span className="break-all text-sm text-gray-600">
                  {formData.email || "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <div className="lg:col-span-2">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-semibold text-gray-800">
                  Personal Information
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Update your profile information below.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Full Name
                  </label>

                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Email Address
                  </label>

                  <input
                    type="email"
                    value={formData.email}
                    disabled
                    className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500"
                  />

                  <p className="mt-1 text-xs text-gray-400">
                    Email address cannot be changed here.
                  </p>
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Phone size={15} />
                    Phone Number
                  </label>

                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="03XX XXXXXXX"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <MapPin size={15} />
                    Address
                  </label>

                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter your address"
                    className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Save */}
              <div className="mt-6 flex justify-end border-t border-gray-100 pt-5">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={18} />

                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}