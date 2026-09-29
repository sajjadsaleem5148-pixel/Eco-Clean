const statusStyles = {
  Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Assigned: "bg-blue-50 text-blue-700 border-blue-200",
  "On the Way": "bg-purple-50 text-purple-700 border-purple-200",
  Collected: "bg-green-50 text-green-700 border-green-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",

  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Resolved: "bg-green-50 text-green-700 border-green-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",

  Active: "bg-green-50 text-green-700 border-green-200",
  Inactive: "bg-gray-50 text-gray-600 border-gray-200",

  Available: "bg-green-50 text-green-700 border-green-200",
  Busy: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Offline: "bg-gray-50 text-gray-600 border-gray-200",

  citizen: "bg-blue-50 text-blue-700 border-blue-200",
  collector: "bg-purple-50 text-purple-700 border-purple-200",
  admin: "bg-red-50 text-red-700 border-red-200",
};

export default function StatusBadge({ status }) {
  if (!status) {
    return null;
  }

  const style =
    statusStyles[status] ||
    "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style}`}
    >
      {status}
    </span>
  );
}