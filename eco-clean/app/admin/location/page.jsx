"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2, Pencil } from "lucide-react";

export default function AdminLocationsPage() {
  // Temporary locations
  // Baad mein MongoDB se load hongi
  const [locations, setLocations] = useState([]);

  return (
    <div>
      {/* Heading */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Locations
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage waste collection areas
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={18} />
          Add Location
        </button>
      </div>

      {/* Locations */}
      {locations.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <div
              key={location._id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              {/* Location Icon */}
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <MapPin size={22} />
                </div>

                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  Active
                </span>
              </div>

              {/* Location Info */}
              <h2 className="mt-4 text-lg font-semibold text-gray-800">
                {location.name}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {location.address}
              </p>

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
            <MapPin size={26} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            No locations found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Add collection areas to manage where EcoClean
            services are available.
          </p>
        </div>
      )}
    </div>
  );
}