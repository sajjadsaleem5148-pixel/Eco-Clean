import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  MapPin,
  ArrowRight,
} from "lucide-react";

const statusStyles = {
  Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Resolved: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
};

export default function ComplaintCard({ complaint }) {
  if (!complaint) {
    return null;
  }

  const statusClass =
    statusStyles[complaint.status] ||
    "bg-gray-50 text-gray-700 border-gray-200";

  const createdDate = complaint.createdAt
    ? new Date(complaint.createdAt).toLocaleDateString()
    : "Not specified";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
            <AlertCircle size={21} />
          </div>

          <div>
            <h3 className="font-bold text-gray-900">
              {complaint.subject || "Waste Complaint"}
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Waste Management Complaint
            </p>
          </div>
        </div>

        {/* Status */}
        <span
          className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}
        >
          {complaint.status || "Pending"}
        </span>
      </div>

      {/* Description */}
      <div className="mt-5 rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-medium text-gray-500">
          Description
        </p>

        <p className="mt-1 text-sm leading-6 text-gray-700">
          {complaint.description || "No description available."}
        </p>
      </div>

      {/* Details */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
          <MapPin
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Location
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {complaint.location || "Not provided"}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
          <CalendarDays
            size={18}
            className="mt-0.5 shrink-0 text-green-600"
          />

          <div>
            <p className="text-xs text-gray-500">
              Submitted
            </p>

            <p className="mt-1 text-sm font-medium text-gray-800">
              {createdDate}
            </p>
          </div>
        </div>
      </div>

      {/* Admin Reply */}
      {complaint.adminReply && (
        <div className="mt-4 rounded-xl border border-green-100 bg-green-50 p-4">
          <p className="text-xs font-semibold text-green-700">
            Admin Reply
          </p>

          <p className="mt-1 text-sm leading-6 text-gray-700">
            {complaint.adminReply}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-400">
          Complaint ID:{" "}
          <span className="font-medium text-gray-500">
            {complaint._id
              ? complaint._id.slice(-8)
              : "N/A"}
          </span>
        </p>

        {complaint._id && (
          <Link
            href={`/complaints?id=${complaint._id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-600 transition hover:text-green-700"
          >
            View Details
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}