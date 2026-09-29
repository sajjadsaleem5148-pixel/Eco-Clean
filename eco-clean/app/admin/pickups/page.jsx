"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, RefreshCw } from "lucide-react";
import api from "../../../lib/api";

export default function AdminPickupsPage() {
  const [pickups, setPickups] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ===============================
  // GET ALL PICKUPS
  // ===============================
  const fetchPickups = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await api.get("/pickups", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPickups(response.data.pickups || []);
    } catch (error) {
      console.error("Fetch Pickups Error:", error);

      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        return;
      }

      if (error.response?.status === 403) {
        setError("Only admin can view all pickup requests.");
        return;
      }

      setError(
        error.response?.data?.message ||
          "Failed to load pickup requests."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPickups();
  }, []);

  // ===============================
  // SEARCH + FILTER
  // ===============================
  const filteredPickups = pickups.filter((pickup) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      pickup.user?.name?.toLowerCase().includes(searchText) ||
      pickup.user?.email?.toLowerCase().includes(searchText) ||
      pickup.address?.toLowerCase().includes(searchText) ||
      pickup.wasteType?.toLowerCase().includes(searchText) ||
      pickup._id?.toLowerCase().includes(searchText);

    const matchesStatus =
      !statusFilter || pickup.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // ===============================
  // DATE FORMAT
  // ===============================
  const formatDate = (date) => {
    if (!date) return "-";

    return new Date(date).toLocaleDateString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // ===============================
  // STATUS STYLE
  // ===============================
  const getStatusClass = (status) => {
    const styles = {
      Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
      Assigned: "bg-blue-50 text-blue-700 border-blue-200",
      "On the Way":
        "bg-purple-50 text-purple-700 border-purple-200",
      Collected:
        "bg-green-50 text-green-700 border-green-200",
      Completed:
        "bg-emerald-50 text-emerald-700 border-emerald-200",
      Rejected:
        "bg-red-50 text-red-700 border-red-200",
      Cancelled:
        "bg-gray-50 text-gray-700 border-gray-200",
    };

    return (
      styles[status] ||
      "bg-gray-50 text-gray-700 border-gray-200"
    );
  };

  return (
    <div>
      {/* PAGE HEADING */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Pickup Requests
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage all waste pickup requests
          </p>
        </div>

        <Link
          href="/request-pickup"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700"
        >
          <Plus size={18} />
          New Pickup
        </Link>
      </div>

      {/* ERROR */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SEARCH + FILTER */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row">
          {/* SEARCH */}
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, email, address, waste type..."
              className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* STATUS FILTER */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-green-500"
          >
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="On the Way">On the Way</option>
            <option value="Collected">Collected</option>
            <option value="Completed">Completed</option>
            <option value="Rejected">Rejected</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          {/* REFRESH */}
          <button
            onClick={fetchPickups}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              size={17}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* LOADING */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <RefreshCw
            size={30}
            className="mx-auto animate-spin text-green-600"
          />

          <p className="mt-3 text-sm text-gray-500">
            Loading pickup requests...
          </p>
        </div>
      ) : (
        <>
          {/* COUNT */}
          <div className="mb-3 text-sm text-gray-500">
            Showing{" "}
            <span className="font-semibold text-gray-800">
              {filteredPickups.length}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-gray-800">
              {pickups.length}
            </span>{" "}
            pickup requests
          </div>

          {/* TABLE */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Waste Type</th>
                    <th className="px-5 py-3">Address</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Collector</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filteredPickups.length > 0 ? (
                    filteredPickups.map((pickup) => (
                      <tr
                        key={pickup._id}
                        className="transition hover:bg-gray-50"
                      >
                        {/* USER */}
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-800">
                            {pickup.user?.name || "Unknown"}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {pickup.user?.email || "-"}
                          </p>
                        </td>

                        {/* WASTE TYPE */}
                        <td className="px-5 py-4">
                          <span className="font-medium text-gray-700">
                            {pickup.wasteType === "Organic" && "🟢 "}
                            {pickup.wasteType === "Recyclable" && "🔵 "}
                            {pickup.wasteType === "General" && "🟡 "}
                            {pickup.wasteType || "-"}
                          </span>
                        </td>

                        {/* ADDRESS */}
                        <td className="max-w-xs px-5 py-4">
                          <p className="truncate text-gray-700">
                            {pickup.address || "-"}
                          </p>
                        </td>

                        {/* DATE */}
                        <td className="whitespace-nowrap px-5 py-4 text-gray-700">
                          {formatDate(pickup.pickupDate)}
                        </td>

                        {/* COLLECTOR */}
                        <td className="px-5 py-4">
                          {pickup.collector?.name ? (
                            <div>
                              <p className="font-medium text-gray-700">
                                {pickup.collector.name}
                              </p>

                              <p className="text-xs text-gray-400">
                                {pickup.collector.phone || ""}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Not assigned
                            </span>
                          )}
                        </td>

                        {/* STATUS */}
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
                              pickup.status
                            )}`}
                          >
                            {pickup.status || "Pending"}
                          </span>
                        </td>

                        {/* ACTION */}
                        <td className="whitespace-nowrap px-5 py-4">
                          <Link
                            href={`/admin/pickups/${pickup._id}`}
                            className="text-sm font-semibold text-green-600 transition hover:text-green-700"
                          >
                            View / Manage
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="7"
                        className="px-5 py-12 text-center"
                      >
                        <p className="text-gray-500">
                          No pickup requests found.
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {search || statusFilter
                            ? "Try changing your search or filter."
                            : "Pickup requests will appear here when citizens submit them."}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

