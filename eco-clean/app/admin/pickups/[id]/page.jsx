
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  User,
  MapPin,
  Phone,
  CalendarDays,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

import api from "@/lib/api";

export default function PickupDetailsPage({ params }) {
  const [pickup, setPickup] = useState(null);
  const [collectors, setCollectors] = useState([]);
  const [selectedCollector, setSelectedCollector] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingCollectors, setLoadingCollectors] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState("");

  // ===============================
  // LOAD PICKUP
  // ===============================

  useEffect(() => {
    const loadPickup = async () => {
      try {
        setLoading(true);
        setError("");

        const token = localStorage.getItem("token");

        if (!token) {
          window.location.href = "/login";
          return;
        }

        const { id } = await params;

        const response = await api.get(`/pickups/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const pickupData = response.data.pickup || null;

        setPickup(pickupData);

        if (pickupData?.collector?._id) {
          setSelectedCollector(pickupData.collector._id);
        }
      } catch (error) {
        console.error(
          "Pickup details error:",
          error.response?.data?.message || error.message
        );

        setError(
          error.response?.data?.message ||
            "Unable to load pickup details."
        );
      } finally {
        setLoading(false);
      }
    };

    loadPickup();
  }, [params]);

  // ===============================
  // LOAD COLLECTORS
  // ===============================

  useEffect(() => {
    const loadCollectors = async () => {
      try {
        setLoadingCollectors(true);

        const token = localStorage.getItem("token");

        if (!token) {
          return;
        }

        const response = await api.get("/collectors", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setCollectors(response.data.collectors || []);
      } catch (error) {
        console.error(
          "Collectors Error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoadingCollectors(false);
      }
    };

    loadCollectors();
  }, []);

  // ===============================
  // ASSIGN COLLECTOR
  // ===============================

  const assignCollector = async () => {
    if (!selectedCollector) {
      alert("Please select a collector.");
      return;
    }

    try {
      setAssigning(true);

      const token = localStorage.getItem("token");

      const response = await api.put(
        `/pickups/${pickup._id}/assign`,
        {
          collectorId: selectedCollector,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPickup(response.data.pickup);

      alert("Pickup assigned to collector successfully.");
    } catch (error) {
      console.error(
        "Assign Collector Error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to assign collector."
      );
    } finally {
      setAssigning(false);
    }
  };

  // ===============================
  // UPDATE STATUS
  // ===============================

  const updateStatus = async (status) => {
    try {
      setUpdating(true);

      const token = localStorage.getItem("token");

      const response = await api.put(
        `/pickups/${pickup._id}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPickup(response.data.pickup);

      alert(`Pickup status updated to "${status}"`);
    } catch (error) {
      console.error(
        "Status update error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to update pickup status."
      );
    } finally {
      setUpdating(false);
    }
  };

  // ===============================
  // STATUS STYLE
  // ===============================

  const getStatusClass = (status) => {
    const styles = {
      Pending: "bg-yellow-100 text-yellow-700",
      Assigned: "bg-blue-100 text-blue-700",
      "On the Way": "bg-purple-100 text-purple-700",
      Collected: "bg-green-100 text-green-700",
      Completed: "bg-emerald-100 text-emerald-700",
      Rejected: "bg-red-100 text-red-700",
      Cancelled: "bg-gray-100 text-gray-700",
    };

    return (
      styles[status] ||
      "bg-yellow-100 text-yellow-700"
    );
  };

  // ===============================
  // LOADING
  // ===============================

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <RefreshCw
            size={32}
            className="mx-auto animate-spin text-green-600"
          />

          <p className="mt-4 text-sm text-gray-500">
            Loading pickup details...
          </p>
        </div>
      </div>
    );
  }

  // ===============================
  // ERROR / NOT FOUND
  // ===============================

  if (error || !pickup) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center shadow-sm">
          <XCircle
            size={48}
            className="mx-auto text-red-400"
          />

          <h2 className="mt-4 text-xl font-semibold text-gray-800">
            {error ? "Unable to Load Pickup" : "Pickup Not Found"}
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            {error ||
              "The requested pickup could not be found."}
          </p>

          <Link
            href="/admin/pickups"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <ArrowLeft size={17} />
            Back to Pickups
          </Link>
        </div>
      </div>
    );
  }

  // ===============================
  // PAGE
  // ===============================

  return (
    <div>
      {/* HEADER */}
      <div className="mb-6">
        <Link
          href="/admin/pickups"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
        >
          <ArrowLeft size={17} />
          Back to Pickups
        </Link>

        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Pickup Details
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View and manage this waste pickup request.
            </p>
          </div>

          <span
            className={`w-fit rounded-full px-4 py-2 text-sm font-medium ${getStatusClass(
              pickup.status
            )}`}
          >
            {pickup.status || "Pending"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* MAIN DETAILS */}
        <div className="space-y-6 xl:col-span-2">
          {/* PICKUP INFORMATION */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <Truck size={21} />
              </div>

              <div>
                <h2 className="font-semibold text-gray-800">
                  Pickup Information
                </h2>

                <p className="text-xs text-gray-500">
                  ID: {pickup._id}
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* WASTE TYPE */}
              <div>
                <p className="text-xs text-gray-400">
                  Waste Type
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-700">
                  {pickup.wasteType === "Organic" && "🟢 "}
                  {pickup.wasteType === "Recyclable" && "🔵 "}
                  {pickup.wasteType === "General" && "🟡 "}
                  {pickup.wasteType || "-"}
                </p>
              </div>

              {/* SEPARATED */}
              <div>
                <p className="text-xs text-gray-400">
                  Waste Separation
                </p>

                <p
                  className={`mt-1 text-sm font-semibold ${
                    pickup.isSeparated
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {pickup.isSeparated
                    ? "✓ Properly Separated"
                    : "✕ Mixed Waste"}
                </p>
              </div>

              {/* DATE */}
              <div>
                <p className="text-xs text-gray-400">
                  Pickup Date
                </p>

                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <CalendarDays size={16} />

                  {pickup.pickupDate
                    ? new Date(
                        pickup.pickupDate
                      ).toLocaleDateString("en-PK", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "-"}
                </p>
              </div>

              {/* TIME */}
              <div>
                <p className="text-xs text-gray-400">
                  Pickup Time
                </p>

                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Clock size={16} />
                  {pickup.pickupTime || "-"}
                </p>
              </div>

              {/* ADDRESS */}
              <div className="md:col-span-2">
                <p className="text-xs text-gray-400">
                  Pickup Address
                </p>

                <p className="mt-1 flex items-start gap-2 text-sm font-semibold text-gray-700">
                  <MapPin
                    size={16}
                    className="mt-0.5 shrink-0"
                  />

                  {pickup.address || "-"}
                </p>
              </div>
            </div>

            {/* DESCRIPTION */}
            <div className="mt-6 border-t border-gray-100 pt-5">
              <div className="flex items-center gap-2">
                <FileText
                  size={17}
                  className="text-gray-400"
                />

                <p className="text-sm font-semibold text-gray-700">
                  Waste Description
                </p>
              </div>

              <p className="mt-2 rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-600">
                {pickup.wasteDescription ||
                  "No description provided."}
              </p>
            </div>

            {/* NOTES */}
            {pickup.notes && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="text-sm font-semibold text-gray-700">
                  Additional Notes
                </p>

                <p className="mt-2 rounded-lg bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
                  {pickup.notes}
                </p>
              </div>
            )}

            {/* IMAGE */}
            {pickup.image && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                <p className="mb-3 text-sm font-semibold text-gray-700">
                  Waste Image
                </p>

                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL?.replace(
                    "/api",
                    ""
                  )}${pickup.image.startsWith("/") ? "" : "/"}${
                    pickup.image
                  }`}
                  alt="Waste"
                  className="max-h-80 rounded-lg border border-gray-200 object-contain"
                />
              </div>
            )}
          </div>

          {/* CITIZEN INFORMATION */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <User size={21} />
              </div>

              <div>
                <h2 className="font-semibold text-gray-800">
                  Citizen Information
                </h2>

                <p className="text-xs text-gray-500">
                  User who requested this pickup
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <p className="text-xs text-gray-400">
                  Name
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-700">
                  {pickup.user?.name || "Unknown"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Email
                </p>

                <p className="mt-1 break-all text-sm font-semibold text-gray-700">
                  {pickup.user?.email || "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Phone
                </p>

                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Phone size={16} />
                  {pickup.user?.phone ||
                    pickup.phone ||
                    "-"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Address
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-700">
                  {pickup.user?.address ||
                    pickup.address ||
                    "-"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-6">
          {/* ASSIGN COLLECTOR */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
              <Truck
                size={20}
                className="text-green-600"
              />

              <h2 className="font-semibold text-gray-800">
                Assign Collector
              </h2>
            </div>

            <div className="mt-5">
              {loadingCollectors ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <RefreshCw
                    size={16}
                    className="animate-spin"
                  />
                  Loading collectors...
                </div>
              ) : collectors.length === 0 ? (
                <div className="rounded-lg bg-yellow-50 p-4">
                  <p className="text-sm font-medium text-yellow-700">
                    No collectors found
                  </p>

                  <p className="mt-1 text-xs text-yellow-600">
                    Create a collector first from the
                    Admin Collectors page.
                  </p>
                </div>
              ) : (
                <>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Select Collector
                  </label>

                  <select
                    value={selectedCollector}
                    onChange={(e) =>
                      setSelectedCollector(e.target.value)
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">
                      Select a collector
                    </option>

                    {collectors.map((collector) => (
                      <option
                        key={collector._id}
                        value={collector._id}
                      >
                        {collector.name}{" "}
                        {collector.phone
                          ? `- ${collector.phone}`
                          : ""}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={assignCollector}
                    disabled={
                      assigning || !selectedCollector
                    }
                    className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    {assigning
                      ? "Assigning..."
                      : "Assign Collector"}
                  </button>
                </>
              )}
            </div>

            {/* CURRENT COLLECTOR */}
            {pickup.collector && (
              <div className="mt-5 rounded-lg border border-green-100 bg-green-50 p-4">
                <p className="text-xs font-medium text-green-600">
                  Currently Assigned
                </p>

                <p className="mt-1 font-semibold text-gray-800">
                  {pickup.collector.name}
                </p>

                <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                  <Phone size={14} />
                  {pickup.collector.phone || "-"}
                </p>
              </div>
            )}
          </div>

          {/* STATUS ACTIONS */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800">
              Update Status
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Change the current pickup status.
            </p>

            <div className="mt-5 space-y-2">
              {[
                "Pending",
                "Assigned",
                "On the Way",
                "Collected",
                "Completed",
                "Rejected",
                "Cancelled",
              ].map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={
                    updating || pickup.status === status
                  }
                  onClick={() => updateStatus(status)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                    pickup.status === status
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{status}</span>

                  {pickup.status === status && (
                    <CheckCircle2 size={17} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
