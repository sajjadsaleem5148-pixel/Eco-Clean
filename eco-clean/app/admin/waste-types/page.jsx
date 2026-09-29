"use client";

import { useState } from "react";
import {
  Recycle,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

export default function AdminWasteTypesPage() {
  // Temporary waste types
  // Baad mein MongoDB se load hongi
  const [wasteTypes, setWasteTypes] = useState([]);

  return (
    <div>
      {/* Heading */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Waste Types
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage supported waste categories
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
        >
          <Plus size={18} />
          Add Waste Type
        </button>
      </div>

      {/* Waste Types */}
      {wasteTypes.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {wasteTypes.map((wasteType) => (
            <div
              key={wasteType._id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              {/* Icon + Status */}
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <Recycle size={22} />
                </div>

                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  Active
                </span>
              </div>

              {/* Name */}
              <h2 className="mt-4 text-lg font-semibold text-gray-800">
                {wasteType.name}
              </h2>

              {/* Description */}
              <p className="mt-1 text-sm text-gray-500">
                {wasteType.description || "No description available"}
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
            <Recycle size={26} />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-800">
            No waste types found
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Add waste categories such as organic, plastic,
            paper, glass and electronic waste.
          </p>
        </div>
      )}
    </div>
  );
}