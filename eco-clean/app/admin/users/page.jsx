"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";

import UserTable from "@/components/admin/UserTable";
import api from "@/lib/api";

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  // Users load karna
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const token = localStorage.getItem("token");

        const response = await api.get("/admin/users", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setUsers(response.data.users || []);
      } catch (error) {
        console.error(
          "Users load error:",
          error.response?.data?.message || error.message
        );
      }
    };

    loadUsers();
  }, []);

  // Search filter
  const filteredUsers = users.filter((user) => {
    const searchText = search.toLowerCase();

    return (
      user.name?.toLowerCase().includes(searchText) ||
      user.email?.toLowerCase().includes(searchText) ||
      user.phone?.toLowerCase().includes(searchText)
    );
  });

  return (
    <div>
      {/* Heading */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Users
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage all registered EcoClean users
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <UserPlus size={18} />
          Add User
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users..."
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* User Table */}
      <UserTable users={filteredUsers} />
    </div>
  );
}