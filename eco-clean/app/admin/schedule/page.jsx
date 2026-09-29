"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Plus, Trash2, Pencil } from "lucide-react";

import api from "@/lib/api";

export default function AdminSchedulesPage() {
  const [schedules, setSchedules] = useState([]);

  // Schedules load karna
  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const response = await api.get("/schedules");

        setSchedules(response.data.schedules || []);
      } catch (error) {
        console.error(
          "Schedules load error:",
          error.response?.data?.message || error.message
        );
      }
    };

    loadSchedules();
  }, []);

  return (
    <div>
      {/* Heading */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Collection Schedules
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage waste collection schedules
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={18} />
          Add Schedule
        </button>
      </div>

      {/* Schedule Cards */}
      {schedules.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {schedules.map((schedule) => (
            <div
              key={schedule._id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              {/* Top */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <CalendarDays size={22} />
                  </div>

                  <div>
                    <h2 className="font-semibold text-gray-800">
                      {schedule.area}
                    </h2>

                    <p className="text-sm text-gray-500">
                      {schedule.day}
                    </p>
                  </div>
                </div>

                {/* Status */}
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

              {/* Details */}
              <div className="mt-5 space-y-2 text-sm">
                <p className="text-gray-600">
                  <span className="font-medium text-gray-800">
                    Collection Time:
                  </span>{" "}
                  {schedule.collectionTime}
                </p>

                <p className="text-gray-600">
                  <span className="font-medium text-gray-800">
                    Collector:
                  </span>{" "}
                  {schedule.collector?.name || "Not assigned"}
                </p>

                <p className="text-gray-600">
                  <span className="font-medium text-gray-800">
                    Waste Types:
                  </span>{" "}
                  {schedule.wasteTypes?.length > 0
                    ? schedule.wasteTypes.join(", ")
                    : "Not specified"}
                </p>
              </div>

              {/* Actions */}
              <div className="mt-5 flex gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Pencil size={16} />
                  Edit
                </button>

                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CalendarDays size={26} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            No schedules found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Collection schedules will appear here after
            they are added to the system.
          </p>
        </div>
      )}
    </div>
  );
}