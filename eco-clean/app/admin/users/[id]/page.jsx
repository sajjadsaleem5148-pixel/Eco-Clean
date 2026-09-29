"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import api from "@/lib/api";

export default function AdminUserDetailsPage({ params }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = localStorage.getItem("token");
        const { id } = await params;

        const response = await api.get(`/admin/users/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setUser(response.data.user || null);
      } catch (error) {
        console.error(
          "User details error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [params]);

  const updateRole = async (role) => {
    try {
      const token = localStorage.getItem("token");

      const response = await api.put(
        `/admin/users/${user._id}`,
        { role },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setUser(response.data.user);

      alert("User role updated successfully.");
    } catch (error) {
      console.error(
        "Role update error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to update user role."
      );
    }
  };

  const deleteUser = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (!confirmed) return;

    try {
      const token = localStorage.getItem("token");

      await api.delete(`/admin/users/${user._id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      alert("User deleted successfully.");

      window.location.href = "/admin/users";
    } catch (error) {
      console.error(
        "Delete user error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to delete user."
      );
    }
  };

  const getRoleClass = (role) => {
    if (role === "admin") {
      return "bg-purple-100 text-purple-700";
    }

    if (role === "collector") {
      return "bg-blue-100 text-blue-700";
    }

    return "bg-green-100 text-green-700";
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading user details...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center shadow-sm">
          <User
            size={48}
            className="mx-auto text-gray-400"
          />

          <h2 className="mt-4 text-xl font-semibold text-gray-800">
            User Not Found
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            The requested user could not be found.
          </p>

          <Link
            href="/admin/users"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <ArrowLeft size={17} />
            Back to Users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
        >
          <ArrowLeft size={17} />
          Back to Users
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              User Details
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View and manage user information.
            </p>
          </div>

          <span
            className={`w-fit rounded-full px-4 py-2 text-sm font-medium ${getRoleClass(
              user.role
            )}`}
          >
            {user.role}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* User Profile */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center border-b border-gray-100 pb-6 sm:flex-row sm:items-start">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-green-600">
                <User size={38} />
              </div>

              <div className="mt-4 text-center sm:ml-5 sm:mt-0 sm:text-left">
                <h2 className="text-xl font-bold text-gray-800">
                  {user.name}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {user.email}
                </p>

                <span
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium ${getRoleClass(
                    user.role
                  )}`}
                >
                  {user.role}
                </span>
              </div>
            </div>

            {/* Information */}
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Mail size={19} />
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Email Address
                  </p>

                  <p className="mt-1 break-all text-sm font-medium text-gray-700">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <Phone size={19} />
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Phone Number
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {user.phone || "Not provided"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 md:col-span-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
                  <MapPin size={19} />
                </div>

                <div>
                  <p className="text-xs text-gray-400">
                    Address
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {user.address || "Not provided"}
                  </p>
                </div>
              </div>
            </div>

            {/* Account Information */}
            <div className="mt-6 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-gray-800">
                Account Information
              </h3>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-400">
                    User ID
                  </p>

                  <p className="mt-1 break-all text-xs font-medium text-gray-600">
                    {user._id}
                  </p>
                </div>

                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-xs text-gray-400">
                    Registered
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-600">
                    {user.createdAt
                      ? new Date(
                          user.createdAt
                        ).toLocaleDateString()
                      : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Actions */}
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <ShieldCheck
                size={21}
                className="text-green-600"
              />

              <h2 className="font-semibold text-gray-800">
                User Role
              </h2>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Change the role assigned to this account.
            </p>

            <div className="mt-4 space-y-2">
              {["citizen", "collector", "admin"].map(
                (role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={user.role === role}
                    onClick={() => updateRole(role)}
                    className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition ${
                      user.role === role
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <span className="capitalize">
                      {role}
                    </span>

                    {user.role === role && (
                      <span>✓</span>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Delete */}
          <div className="rounded-xl border border-red-100 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800">
              Danger Zone
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              Delete this user account permanently.
            </p>

            {user.role === "admin" ? (
              <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
                Admin accounts cannot be deleted.
              </p>
            ) : (
              <button
                type="button"
                onClick={deleteUser}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 size={17} />
                Delete User
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}