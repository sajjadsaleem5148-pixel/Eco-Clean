"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Recycle,
  Truck,
} from "lucide-react";

import api from "@/lib/api";

export default function SchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Schedules backend se load karna
  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const response = await api.get("/schedules");

        setSchedules(response.data.schedules || []);
      } catch (error) {
        console.error(
          "Schedule load error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchedules();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-green-700 px-6 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <CalendarDays size={26} />
            </div>

            <div>
              <h1 className="text-3xl font-bold">
                Collection Schedule
              </h1>

              <p className="mt-1 text-sm text-green-100">
                Check waste collection days and timings for your area.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Loading */}
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-green-600"></div>

            <p className="mt-4 text-sm text-gray-500">
              Loading collection schedules...
            </p>
          </div>
        ) : schedules.length > 0 ? (
          /* Schedule Cards */
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {schedules.map((schedule) => (
              <div
                key={schedule._id}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                {/* Top */}
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <CalendarDays size={24} />
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      schedule.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {schedule.status}
                  </span>
                </div>

                {/* Area */}
                <div className="mt-5">
                  <h2 className="text-xl font-bold text-gray-800">
                    {schedule.area}
                  </h2>

                  <p className="mt-1 flex items-center gap-2 text-sm font-medium text-green-600">
                    <CalendarDays size={16} />
                    {schedule.day}
                  </p>
                </div>

                {/* Details */}
                <div className="mt-5 space-y-3 border-t border-gray-100 pt-5">
                  {/* Time */}
                  <div className="flex items-start gap-3">
                    <Clock
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Collection Time
                      </p>

                      <p className="text-sm font-medium text-gray-700">
                        {schedule.collectionTime}
                      </p>
                    </div>
                  </div>

                  {/* Collector */}
                  <div className="flex items-start gap-3">
                    <Truck
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Collector
                      </p>

                      <p className="text-sm font-medium text-gray-700">
                        {schedule.collector?.name || "Not assigned"}
                      </p>
                    </div>
                  </div>

                  {/* Waste Types */}
                  <div className="flex items-start gap-3">
                    <Recycle
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Waste Types
                      </p>

                      <p className="text-sm font-medium text-gray-700">
                        {schedule.wasteTypes?.length > 0
                          ? schedule.wasteTypes.join(", ")
                          : "All waste types"}
                      </p>
                    </div>
                  </div>

                  {/* Area */}
                  <div className="flex items-start gap-3">
                    <MapPin
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Collection Area
                      </p>

                      <p className="text-sm font-medium text-gray-700">
                        {schedule.area}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CalendarDays size={28} />
            </div>

            <h2 className="mt-4 text-xl font-semibold text-gray-800">
              No schedules available
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Collection schedules will appear here once they
              are added by the EcoClean administration.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}