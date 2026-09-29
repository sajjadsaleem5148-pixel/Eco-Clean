
"use client";

import { useEffect, useState } from "react";
import {
  Search,
  UserPlus,
  X,
  Trash2,
  RefreshCw,
} from "lucide-react";

import api from "@/lib/api";

export default function AdminCollectorsPage() {
  const [collectors, setCollectors] = useState([]);
  const [users, setUsers] = useState([]);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    user: "",
    employeeId: "",
    phone: "",
    area: "",
    vehicleNumber: "",
    vehicleType: "",
  });

  const getToken = () => localStorage.getItem("token");

  // ================================
  // LOAD COLLECTORS
  // ================================
  const loadCollectors = async () => {
    try {
      setLoading(true);
      setError("");

      const token = getToken();

      const response = await api.get("/collectors", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setCollectors(response.data.collectors || []);
    } catch (err) {
      console.error("Collectors load error:", err);

      setError(
        err.response?.data?.message ||
          "Collectors load nahi ho sake."
      );
    } finally {
      setLoading(false);
    }
  };

  // ================================
  // LOAD USERS
  // ================================
  const loadUsers = async () => {
    try {
      const token = getToken();

      const response = await api.get("/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const allUsers = response.data.users || [];

      // Sirf citizen users jo collector ban sakte hain
      const availableUsers = allUsers.filter(
        (user) => user.role === "citizen"
      );

      setUsers(availableUsers);
    } catch (err) {
      console.error("Users load error:", err);

      setError(
        err.response?.data?.message ||
          "Users load nahi ho sake."
      );
    }
  };

  // ================================
  // INITIAL LOAD
  // ================================
  useEffect(() => {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";
      return;
    }

    loadCollectors();
    loadUsers();
  }, []);

  // ================================
  // FORM CHANGE
  // ================================
  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ================================
  // CREATE COLLECTOR
  // ================================
  const handleSubmit = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const token = getToken();

      await api.post(
        "/collectors",
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage("Collector successfully add ho gaya.");

      setForm({
        user: "",
        employeeId: "",
        phone: "",
        area: "",
        vehicleNumber: "",
        vehicleType: "",
      });

      setShowModal(false);

      await loadCollectors();
      await loadUsers();
    } catch (err) {
      console.error("Create collector error:", err);

      setError(
        err.response?.data?.message ||
          "Collector create nahi ho saka."
      );
    } finally {
      setSaving(false);
    }
  };

  // ================================
  // DELETE COLLECTOR
  // ================================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Kya aap is collector ko delete karna chahte hain?"
    );

    if (!confirmDelete) return;

    try {
      const token = getToken();

      await api.delete(`/collectors/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setMessage("Collector delete ho gaya.");

      await loadCollectors();
      await loadUsers();
    } catch (err) {
      console.error("Delete collector error:", err);

      setError(
        err.response?.data?.message ||
          "Collector delete nahi ho saka."
      );
    }
  };

  // ================================
  // SEARCH
  // ================================
  const filteredCollectors = collectors.filter(
    (collector) => {
      const name = collector.user?.name || "";
      const email = collector.user?.email || "";
      const employeeId = collector.employeeId || "";
      const area = collector.area || "";

      const searchText = search.toLowerCase();

      return (
        name.toLowerCase().includes(searchText) ||
        email.toLowerCase().includes(searchText) ||
        employeeId.toLowerCase().includes(searchText) ||
        area.toLowerCase().includes(searchText)
      );
    }
  );

  return (
    <div>
      {/* HEADER */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Collectors
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage waste collection staff
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadCollectors}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => {
              setError("");
              setMessage("");
              setShowModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <UserPlus size={18} />
            Add Collector
          </button>
        </div>
      </div>

      {/* MESSAGES */}
      {message && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SEARCH */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search collectors..."
            className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-5 py-3">Collector</th>
                <th className="px-5 py-3">Employee ID</th>
                <th className="px-5 py-3">Area</th>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    Loading collectors...
                  </td>
                </tr>
              ) : filteredCollectors.length > 0 ? (
                filteredCollectors.map((collector) => (
                  <tr
                    key={collector._id}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-800">
                        {collector.user?.name || "Unknown"}
                      </p>

                      <p className="text-xs text-gray-500">
                        {collector.user?.email || "-"}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {collector.employeeId || "-"}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {collector.area || "-"}
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {collector.vehicleNumber || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          collector.status === "Available"
                            ? "bg-green-100 text-green-700"
                            : collector.status === "Busy"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {collector.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(collector._id)
                        }
                        className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    className="px-5 py-12 text-center"
                  >
                    <p className="text-gray-500">
                      No collectors found.
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Click Add Collector to create one.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD COLLECTOR MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Add Collector
                </h2>

                <p className="text-sm text-gray-500">
                  Add a user as a waste collector
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* FORM */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4 p-5"
            >
              {/* User */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Select User
                </label>

                <select
                  name="user"
                  value={form.user}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                >
                  <option value="">
                    Select a citizen
                  </option>

                  {users.map((user) => (
                    <option
                      key={user._id}
                      value={user._id}
                    >
                      {user.name} — {user.email}
                    </option>
                  ))}
                </select>

                {users.length === 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    No available citizen users found.
                  </p>
                )}
              </div>

              {/* Employee ID */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Employee ID
                </label>

                <input
                  type="text"
                  name="employeeId"
                  value={form.employeeId}
                  onChange={handleChange}
                  placeholder="EC-001"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Phone
                </label>

                <input
                  type="text"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="03XXXXXXXXX"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {/* Area */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Area
                </label>

                <input
                  type="text"
                  name="area"
                  value={form.area}
                  onChange={handleChange}
                  placeholder="Gulshan-e-Iqbal"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Vehicle Number
                </label>

                <input
                  type="text"
                  name="vehicleNumber"
                  value={form.vehicleNumber}
                  onChange={handleChange}
                  placeholder="ECO-123"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Vehicle Type
                </label>

                <input
                  type="text"
                  name="vehicleType"
                  value={form.vehicleType}
                  onChange={handleChange}
                  placeholder="Garbage Truck"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || users.length === 0}
                  className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : "Add Collector"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
