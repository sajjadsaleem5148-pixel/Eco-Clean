"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MapPin,
  Truck,
  Recycle,
} from "lucide-react";

import api from "@/lib/api";

export default function CollectorSchedulePage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const response = await api.get("/schedules");

        setSchedules(response.data.schedules || []);
      } catch (error) {
        console.error(
          "Collector schedules error:",
          error.response?.data?.message || error.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchedules();
  }, []);

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
              Collection Schedule
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              View waste collection schedules and assigned areas.
            </p>
          </div>
        </div>

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
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {schedules.map((schedule) => (
              <div
                key={schedule._id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                {/* Card Header */}
                <div className="border-b border-gray-100 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                        <CalendarDays size={22} />
                      </div>

                      <div>
                        <h2 className="font-semibold text-gray-800">
                          {schedule.area}
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                          {schedule.day}
                        </p>
                      </div>
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
                </div>

                {/* Schedule Details */}
                <div className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <Clock
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Collection Time
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {schedule.collectionTime || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Collection Area
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {schedule.area || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Truck
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Assigned Collector
                      </p>

                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {schedule.collector?.name ||
                          "Not assigned"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Recycle
                      size={18}
                      className="mt-0.5 text-gray-400"
                    />

                    <div>
                      <p className="text-xs text-gray-400">
                        Waste Types
                      </p>

                      {schedule.wasteTypes?.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {schedule.wasteTypes.map(
                            (type, index) => (
                              <span
                                key={`${type}-${index}`}
                                className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                              >
                                {type}
                              </span>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-gray-500">
                          Not specified
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CalendarDays size={28} />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-gray-800">
              No Schedules Available
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              There are currently no collection schedules
              available.
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