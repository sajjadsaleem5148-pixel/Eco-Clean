"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Truck,
  MapPin,
  Phone,
  CalendarDays,
  Clock,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

import api from "@/lib/api";

export default function CollectorPickupsPage() {
  const [pickups, setPickups] = useState([]);
  const [collector, setCollector] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPickups = async () => {
      try {
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");

        if (!token || !userData) {
          setLoading(false);
          return;
        }

        const user = JSON.parse(userData);

        // Collector information get karna
       const collectorResponse = await api.get("/collectors/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const currentCollector =
  collectorResponse.data.collector || null;

setCollector(currentCollector);

        // Assigned pickups get karna
        if (currentCollector?._id) {
          const response = await api.get(
            `/collectors/${currentCollector._id}/pickups`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          setPickups(response.data.pickups || []);
        }
      } catch (error) {
        console.error(
          "Collector pickups error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadPickups();
  }, []);

  // Pickup status update
  const updateStatus = async (pickupId, status) => {
    try {
      const token = localStorage.getItem("token");

      await api.put(
        `/pickups/${pickupId}/status`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setPickups((previous) =>
        previous.map((pickup) =>
          pickup._id === pickupId
            ? { ...pickup, status }
            : pickup
        )
      );

      alert(`Pickup status changed to ${status}`);
    } catch (error) {
      console.error(
        "Pickup status error:",
        error.response?.data?.message || error.message
      );

      alert(
        error.response?.data?.message ||
          "Unable to update pickup status."
      );
    }
  };

  // Status styling
  const getStatusClass = (status) => {
    if (status === "Completed") {
      return "bg-green-100 text-green-700";
    }

    if (status === "Collected") {
      return "bg-purple-100 text-purple-700";
    }

    if (status === "On the Way") {
      return "bg-blue-100 text-blue-700";
    }

    if (status === "Cancelled") {
      return "bg-red-100 text-red-700";
    }

    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/collector"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-green-600"
          >
            <ArrowLeft size={17} />
            Back to Dashboard
          </Link>

          <div className="mt-4">
            <h1 className="text-3xl font-bold text-gray-800">
              Assigned Pickups
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View and manage all waste pickup requests assigned
              to you.
            </p>
          </div>
        </div>

        {/* Collector Info */}
        {collector && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs text-gray-400">
                  Collector
                </p>

                <h2 className="mt-1 font-semibold text-gray-800">
                  {collector.user?.name || "Collector"}
                </h2>
              </div>

              <div className="flex flex-wrap gap-5 text-sm text-gray-600">
                <span>
                  Employee ID:{" "}
                  <strong>{collector.employeeId}</strong>
                </span>

                <span>
                  Area:{" "}
                  <strong>{collector.area || "-"}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

            <p className="mt-4 text-sm text-gray-500">
              Loading assigned pickups...
            </p>
          </div>
        ) : pickups.length > 0 ? (
          <div className="space-y-5">
            {pickups.map((pickup) => (
              <div
                key={pickup._id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                {/* Pickup Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                      <Truck size={22} />
                    </div>

                    <div>
                      <h2 className="font-semibold text-gray-800">
                        {pickup.wasteType}
                      </h2>

                      <p className="mt-1 text-xs text-gray-400">
                        Pickup ID: {pickup._id}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                      pickup.status
                    )}`}
                  >
                    {pickup.status}
                  </span>
                </div>

                {/* Pickup Details */}
                <div className="mt-5 grid grid-cols-1 gap-5 border-t border-gray-100 pt-5 md:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-start gap-3">
                    <MapPin
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Address
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {pickup.address || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Phone
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Citizen
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {pickup.user?.name || "Unknown"}
                      </p>

                      <p className="text-xs text-gray-500">
                        {pickup.user?.phone || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CalendarDays
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Pickup Date
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {pickup.pickupDate
                          ? new Date(
                              pickup.pickupDate
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Clock
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Pickup Time
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {pickup.pickupTime || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Waste Description */}
                {pickup.wasteDescription && (
                  <div className="mt-5 rounded-lg bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">
                      Waste Description
                    </p>

                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      {pickup.wasteDescription}
                    </p>
                  </div>
                )}

                {/* Actions */}
                {pickup.status !== "Completed" &&
                  pickup.status !== "Cancelled" && (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            pickup._id,
                            "On the Way"
                          )
                        }
                        disabled={pickup.status === "On the Way"}
                        className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        On the Way
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            pickup._id,
                            "Collected"
                          )
                        }
                        disabled={pickup.status === "Collected"}
                        className="rounded-lg border border-purple-200 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Mark Collected
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateStatus(
                            pickup._id,
                            "Completed"
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                      >
                        <CheckCircle2 size={17} />
                        Complete Pickup
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Truck size={28} />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-800">
              No Pickups Assigned
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              There are currently no waste pickup requests
              assigned to you.
            </p>

            <Link
              href="/collector"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <ArrowLeft size={17} />
              Back to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}