import Link from "next/link";
import {
  CalendarDays,
  Clock,
  MapPin,
  Truck,
  ArrowRight,
  CheckCircle2,
  XCircle,
  UserRound,
} from "lucide-react";

const wasteStyles = {
  Organic: {
    icon: "🟢",
    label: "Organic Waste",
    className: "bg-green-50 text-green-700 border-green-200",
  },

  Recyclable: {
    icon: "🔵",
    label: "Recyclable Waste",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },

  General: {
    icon: "🟡",
    label: "General Waste",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
};

const statusStyles = {
  Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Assigned: "bg-blue-50 text-blue-700 border-blue-200",
  "On the Way": "bg-purple-50 text-purple-700 border-purple-200",
  Collected: "bg-green-50 text-green-700 border-green-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default function PickupCard({ pickup }) {
  if (!pickup) {
    return null;
  }

  const waste =
    wasteStyles[pickup.wasteType] || {
      icon: "♻️",
      label: pickup.wasteType || "Waste Pickup",
      className: "bg-gray-50 text-gray-700 border-gray-200",
    };

  const statusClass =
    statusStyles[pickup.status] ||
    "bg-gray-50 text-gray-700 border-gray-200";

  const pickupDate = pickup.pickupDate
    ? new Date(pickup.pickupDate).toLocaleDateString("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not specified";

  const collectorName =
    pickup.collector?.name || "Not assigned yet";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">

      {/* Top Section */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

        <div className="flex items-start gap-3">

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-50 text-2xl">
            {waste.icon}
          </div>

          <div>
            <h3 className="font-bold text-gray-900">
              {waste.label}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              EcoClean Pickup Request
            </p>
          </div>

        </div>

        {/* Status */}
        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}
        >
          {pickup.status || "Pending"}
        </span>
      </div>

      {/* Waste Separation */}
      <div className="mt-4">

        {pickup.isSeparated ? (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            <CheckCircle2 size={17} />
            Waste properly separated
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            <XCircle size={17} />
            Waste is mixed
          </div>
        )}

      </div>

      {/* Pickup Details */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">

        {/* Date */}
        <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
          <CalendarDays
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Pickup Date
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {pickupDate}
            </p>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
          <Clock
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Pickup Time
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {pickup.pickupTime || "Not specified"}
            </p>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 sm:col-span-2">
          <MapPin
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Collection Address
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {pickup.address || "Address not available"}
            </p>
          </div>
        </div>

        {/* Collector */}
        <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 sm:col-span-2">
          <UserRound
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Collector
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {collectorName}
            </p>

            {pickup.collector?.phone && (
              <p className="mt-1 text-xs text-gray-500">
                {pickup.collector.phone}
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Description */}
      {pickup.wasteDescription && (
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">
            Waste Description
          </p>

          <p className="mt-1 text-sm text-gray-700">
            {pickup.wasteDescription}
          </p>
        </div>
      )}

      {/* Bottom */}
      <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">

        <p className="text-xs text-gray-400">
          Request ID:{" "}
          <span className="font-medium text-gray-500">
            {pickup._id ? pickup._id.slice(-8) : "N/A"}
          </span>
        </p>

        {pickup._id && (
          <Link
            href={`/tracking?id=${pickup._id}`}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-green-600 transition hover:text-green-700"
          >
            Track Pickup
            <ArrowRight size={16} />
          </Link>
        )}

      </div>

    </div>
  );
}

