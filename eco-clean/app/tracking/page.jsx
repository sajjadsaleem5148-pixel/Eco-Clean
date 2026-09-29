"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  Truck,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  XCircle,
} from "lucide-react";

import api from "@/lib/api";
import Loading from "@/components/Loading";

export default function TrackingPage() {
  const searchParams = useSearchParams();

  const [trackingId, setTrackingId] = useState("");
  const [pickup, setPickup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // URL se pickup ID
  useEffect(() => {
    const id = searchParams.get("id");

    if (id) {
      setTrackingId(id);
      searchPickup(id);
    }
  }, [searchParams]);

  // Search pickup
  const searchPickup = async (id) => {
    if (!id || !id.trim()) {
      setError("Please enter a pickup ID.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setPickup(null);

      const token = localStorage.getItem("token");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await api.get(`/pickups/${id.trim()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPickup(response.data.pickup);
    } catch (error) {
      console.error("Tracking Error:", error);

      setError(
        error.response?.data?.message ||
          "Pickup not found. Please check your pickup ID."
      );
    } finally {
      setLoading(false);
    }
  };

  // Form submit
  const handleSearch = (event) => {
    event.preventDefault();
    searchPickup(trackingId);
  };

  // Waste information
  const getWasteInfo = (wasteType) => {
    if (wasteType === "Organic") {
      return {
        icon: "🟢",
        name: "Organic Waste",
      };
    }

    if (wasteType === "Recyclable") {
      return {
        icon: "🔵",
        name: "Recyclable Waste",
      };
    }

    if (wasteType === "General") {
      return {
        icon: "🟡",
        name: "General Waste",
      };
    }

    return {
      icon: "♻️",
      name: wasteType || "Waste",
    };
  };

  // Status timeline
  const statuses = [
    {
      name: "Pending",
      icon: Clock3,
    },
    {
      name: "Assigned",
      icon: PackageCheck,
    },
    {
      name: "On the Way",
      icon: Truck,
    },
    {
      name: "Collected",
      icon: MapPin,
    },
    {
      name: "Completed",
      icon: CheckCircle2,
    },
  ];

  const getStatusIndex = (status) => {
    return statuses.findIndex(
      (item) => item.name === status
    );
  };

  const waste = getWasteInfo(pickup?.wasteType);

  const currentIndex = pickup
    ? getStatusIndex(pickup.status)
    : -1;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <section className="bg-green-700 px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">

          <div className="flex items-center gap-3">

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Truck size={26} />
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                Track Pickup
              </h1>

              <p className="mt-1 text-sm text-green-100">
                Check the current status of your waste collection request.
              </p>
            </div>

          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-6 py-10">

        {/* Search Box */}
        <form
          onSubmit={handleSearch}
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-bold text-gray-800">
            Enter Pickup ID
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Enter your pickup request ID to check its current status.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">

            <input
              type="text"
              value={trackingId}
              onChange={(event) =>
                setTrackingId(event.target.value)
              }
              placeholder="Enter pickup ID"
              className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              <Search size={18} />

              {loading ? "Searching..." : "Track Pickup"}
            </button>

          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div className="mt-6">
            <Loading text="Loading pickup information..." />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="font-semibold text-red-700">
              Pickup Not Found
            </p>

            <p className="mt-1 text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        {/* Pickup Result */}
        {!loading && pickup && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">

            {/* Pickup Header */}
            <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center">

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Pickup ID
                </p>

                <h2 className="mt-1 break-all text-lg font-bold text-gray-800">
                  {pickup._id}
                </h2>
              </div>

              <span
                className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
                  pickup.status === "Rejected" ||
                  pickup.status === "Cancelled"
                    ? "bg-red-100 text-red-700"
                    : pickup.status === "Completed"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {pickup.status || "Pending"}
              </span>

            </div>

            {/* Waste Type */}
            <div className="mt-6 rounded-xl bg-green-50 p-4">

              <div className="flex items-center gap-3">

                <span className="text-3xl">
                  {waste.icon}
                </span>

                <div>
                  <p className="text-xs text-gray-500">
                    Waste Type
                  </p>

                  <p className="font-bold text-gray-800">
                    {waste.name}
                  </p>
                </div>

              </div>

            </div>

            {/* Separation */}
            <div
              className={`mt-4 flex items-center gap-2 rounded-lg p-3 text-sm font-medium ${
                pickup.isSeparated
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {pickup.isSeparated ? (
                <>
                  <CheckCircle2 size={18} />
                  Waste properly separated
                </>
              ) : (
                <>
                  <XCircle size={18} />
                  Waste is mixed
                </>
              )}
            </div>

            {/* Pickup Details */}
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">

              <div>
                <p className="text-xs text-gray-400">
                  Pickup Date
                </p>

                <p className="mt-1 font-medium text-gray-700">
                  {pickup.pickupDate
                    ? new Date(
                        pickup.pickupDate
                      ).toLocaleDateString("en-PK", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })
                    : "Not specified"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Pickup Time
                </p>

                <p className="mt-1 font-medium text-gray-700">
                  {pickup.pickupTime || "Not specified"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Collector
                </p>

                <p className="mt-1 font-medium text-gray-700">
                  {pickup.collector?.name ||
                    "Not assigned yet"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400">
                  Collector Phone
                </p>

                <p className="mt-1 font-medium text-gray-700">
                  {pickup.collector?.phone ||
                    "Not available"}
                </p>
              </div>

              <div className="md:col-span-2">

                <p className="text-xs text-gray-400">
                  Pickup Address
                </p>

                <p className="mt-1 flex items-center gap-2 font-medium text-gray-700">
                  <MapPin
                    size={16}
                    className="text-green-600"
                  />

                  {pickup.address ||
                    "Address not available"}
                </p>

              </div>

            </div>

            {/* Rejected Message */}
            {pickup.status === "Rejected" && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">

                <div className="flex items-center gap-2 text-red-700">
                  <XCircle size={20} />

                  <p className="font-semibold">
                    Pickup Rejected
                  </p>
                </div>

                <p className="mt-2 text-sm text-red-600">
                  Waste collection cannot be completed because
                  the waste was not properly separated.
                </p>

              </div>
            )}

            {/* Status Timeline */}
            {pickup.status !== "Rejected" &&
              pickup.status !== "Cancelled" && (
                <div className="mt-10">

                  <h3 className="text-lg font-semibold text-gray-800">
                    Pickup Progress
                  </h3>

                  <div className="mt-8">

                    {statuses.map((status, index) => {

                      const Icon = status.icon;

                      const isCompleted =
                        index <= currentIndex;

                      return (
                        <div
                          key={status.name}
                          className="relative flex items-start gap-4 pb-8 last:pb-0"
                        >

                          {/* Line */}
                          {index <
                            statuses.length - 1 && (
                            <div
                              className={`absolute left-5 top-10 h-full w-0.5 ${
                                index < currentIndex
                                  ? "bg-green-500"
                                  : "bg-gray-200"
                              }`}
                            />
                          )}

                          {/* Icon */}
                          <div
                            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                              isCompleted
                                ? "bg-green-600 text-white"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            <Icon size={19} />
                          </div>

                          {/* Text */}
                          <div className="pt-1">

                            <p
                              className={`font-medium ${
                                isCompleted
                                  ? "text-gray-800"
                                  : "text-gray-400"
                              }`}
                            >
                              {status.name}
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              {isCompleted
                                ? "Status completed"
                                : "Waiting for this step"}
                            </p>

                          </div>

                        </div>
                      );
                    })}

                  </div>
                </div>
              )}

          </div>
        )}

        {/* Empty State */}
        {!loading && !error && !pickup && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Truck size={28} />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-800">
              Track your pickup request
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Enter your pickup request ID above to see the
              latest collection status.
            </p>

          </div>
        )}

      </main>
    </div>
  );
}
