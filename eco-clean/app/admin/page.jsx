import {
  Users,
  Truck,
  MessageSquareWarning,
  CalendarDays,
} from "lucide-react";

import StatCard from "@/components/admin/StatCard";
import PickupTable from "@/components/admin/PickupTable";
import ComplaintTable from "@/components/admin/ComplaintTable";
import Chart from "@/components/admin/Chart";

export default function AdminDashboard() {
  // Temporary data
  // Baad mein ye MongoDB API se ayega
  const stats = {
    users: 0,
    pickups: 0,
    complaints: 0,
    schedules: 0,
  };

  // Temporary chart data
  const chartData = [
    { label: "Mon", value: 0 },
    { label: "Tue", value: 0 },
    { label: "Wed", value: 0 },
    { label: "Thu", value: 0 },
    { label: "Fri", value: 0 },
    { label: "Sat", value: 0 },
    { label: "Sun", value: 0 },
  ];

  return (
    <div>
      {/* Page Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-gray-500">
          Welcome to EcoClean Admin Panel
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        
        <StatCard
          title="Total Users"
          value={stats.users}
          description="Registered users"
          icon={Users}
        />

        <StatCard
          title="Pickup Requests"
          value={stats.pickups}
          description="Total pickup requests"
          icon={Truck}
        />

        <StatCard
          title="Complaints"
          value={stats.complaints}
          description="Citizen complaints"
          icon={MessageSquareWarning}
        />

        <StatCard
          title="Schedules"
          value={stats.schedules}
          description="Collection schedules"
          icon={CalendarDays}
        />

      </div>

      {/* Chart */}
      <div className="mt-6">
        <Chart data={chartData} />
      </div>

      {/* Tables */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        
        <PickupTable pickups={[]} />

        <ComplaintTable complaints={[]} />

      </div>
    </div>
  );
}