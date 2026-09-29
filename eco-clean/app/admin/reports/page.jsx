import {
  BarChart3,
  Truck,
  Users,
  MessageSquareWarning,
  Recycle,
} from "lucide-react";

export default function AdminReportsPage() {
  return (
    <div>
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Reports & Analytics
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          View EcoClean system reports and performance
        </p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Pickup Report */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <Truck size={22} />
          </div>

          <h2 className="mt-4 font-semibold text-gray-800">
            Pickup Report
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Collection requests and completion statistics.
          </p>
        </div>

        {/* User Report */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Users size={22} />
          </div>

          <h2 className="mt-4 font-semibold text-gray-800">
            User Report
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Registered citizens and system users.
          </p>
        </div>

        {/* Complaint Report */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
            <MessageSquareWarning size={22} />
          </div>

          <h2 className="mt-4 font-semibold text-gray-800">
            Complaint Report
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Complaint status and resolution statistics.
          </p>
        </div>

        {/* Waste Report */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Recycle size={22} />
          </div>

          <h2 className="mt-4 font-semibold text-gray-800">
            Waste Report
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Waste types and collection activity.
          </p>
        </div>
      </div>

      {/* Analytics Area */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <BarChart3 size={22} />
          </div>

          <div>
            <h2 className="font-semibold text-gray-800">
              System Analytics
            </h2>

            <p className="text-sm text-gray-500">
              Detailed analytics will appear here.
            </p>
          </div>
        </div>

        {/* Temporary Message */}
        <div className="mt-6 flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
          <div className="text-center">
            <BarChart3
              size={35}
              className="mx-auto text-gray-400"
            />

            <p className="mt-3 text-sm font-medium text-gray-600">
              Analytics data coming soon
            </p>

            <p className="mt-1 text-xs text-gray-400">
              This section will use MongoDB data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}