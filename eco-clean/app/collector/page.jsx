"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Navigation,
} from "lucide-react";

import api from "@/lib/api";

export default function CollectorDashboard() {
  const [collector, setCollector] = useState(null);
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCollectorDashboard = async () => {
      try {
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");

        if (!token || !userData) {
          setLoading(false);
          return;
        }

        const user = JSON.parse(userData);

        // Collector information
        const collectorsResponse = await api.get("/collectors", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const allCollectors =
          collectorsResponse.data.collectors || [];

        const currentCollector = allCollectors.find(
          (item) => item.user?._id === user._id
        );

        setCollector(currentCollector || null);

        // Collector pickups
        if (currentCollector?._id) {
          const pickupsResponse = await api.get(
            `/collectors/${currentCollector._id}/pickups`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          setPickups(pickupsResponse.data.pickups || []);
        }
      } catch (error) {
        console.error(
          "Collector dashboard error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadCollectorDashboard();
  }, []);

  const completedPickups = pickups.filter(
    (pickup) => pickup.status === "Completed"
  ).length;

  const pendingPickups = pickups.filter(
    (pickup) =>
      pickup.status === "Assigned" ||
      pickup.status === "On the Way"
  ).length;

  const collectedPickups = pickups.filter(
    (pickup) => pickup.status === "Collected"
  ).length;

  const updatePickupStatus = async (pickupId, status) => {
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
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10">
        <div className="mx-auto max-w-6xl rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

          <p className="mt-4 text-sm text-gray-500">
            Loading collector dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-green-600">
              EcoClean Collector
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-800">
              Collector Dashboard
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Manage your assigned waste pickup requests.
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
            <p className="text-xs text-gray-400">
              Current Status
            </p>

            <p className="mt-1 font-semibold text-green-600">
              {collector?.status || "Available"}
            </p>
          </div>
        </div>

        {/* Collector Info */}
        {collector && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  {collector.user?.name || "Collector"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Employee ID: {collector.employeeId}
                </p>
              </div>

              <div className="flex flex-wrap gap-5 text-sm text-gray-600">
                <span>
                  Area:{" "}
                  <strong>{collector.area || "-"}</strong>
                </span>

                <span>
                  Vehicle:{" "}
                  <strong>
                    {collector.vehicleNumber || "-"}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Truck size={22} />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Total Pickups
            </p>

            <h2 className="mt-1 text-2xl font-bold text-gray-800">
              {pickups.length}
            </h2>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
              <Clock size={22} />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Pending
            </p>

            <h2 className="mt-1 text-2xl font-bold text-gray-800">
              {pendingPickups}
            </h2>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Navigation size={22} />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Collected
            </p>

            <h2 className="mt-1 text-2xl font-bold text-gray-800">
              {collectedPickups}
            </h2>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <CheckCircle2 size={22} />
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Completed
            </p>

            <h2 className="mt-1 text-2xl font-bold text-gray-800">
              {completedPickups}
            </h2>
          </div>
        </div>

        {/* Assigned Pickups */}
        <div className="mt-8">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">
              Assigned Pickups
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Pickup requests assigned to you.
            </p>
          </div>

          {pickups.length > 0 ? (
            <div className="space-y-5">
              {pickups.map((pickup) => (
                <div
                  key={pickup._id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
                          <Truck size={20} />
                        </div>

                        <div>
                          <h3 className="font-semibold text-gray-800">
                            {pickup.wasteType}
                          </h3>

                          <p className="text-xs text-gray-400">
                            Pickup ID: {pickup._id}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin
                            size={18}
                            className="mt-0.5 text-gray-400"
                          />

                          <div>
                            <p className="text-xs text-gray-400">
                              Pickup Address
                            </p>

                            <p className="text-sm font-medium text-gray-700">
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
                              Citizen Phone
                            </p>

                            <p className="text-sm font-medium text-gray-700">
                              {pickup.user?.phone || "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="lg:text-right">
                      <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-700">
                        {pickup.status}
                      </span>

                      <p className="mt-3 text-sm text-gray-500">
                        {pickup.pickupDate
                          ? new Date(
                              pickup.pickupDate
                            ).toLocaleDateString()
                          : "-"}
                      </p>

                      <p className="text-sm text-gray-500">
                        {pickup.pickupTime || "-"}
                      </p>
                    </div>
                  </div>

                  {/* Status Buttons */}
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      onClick={() =>
                        updatePickupStatus(
                          pickup._id,
                          "On the Way"
                        )
                      }
                      disabled={
                        pickup.status === "On the Way" ||
                        pickup.status === "Completed"
                      }
                      className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      On the Way
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updatePickupStatus(
                          pickup._id,
                          "Collected"
                        )
                      }
                      disabled={
                        pickup.status === "Collected" ||
                        pickup.status === "Completed"
                      }
                      className="rounded-lg border border-purple-200 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Collected
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updatePickupStatus(
                          pickup._id,
                          "Completed"
                        )
                      }
                      disabled={pickup.status === "Completed"}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Complete Pickup
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
                <Truck size={28} />
              </div>

              <h2 className="mt-4 text-lg font-semibold text-gray-800">
                No Pickups Assigned
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                There are currently no pickup requests assigned
                to you.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}