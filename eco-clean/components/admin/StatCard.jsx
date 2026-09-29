import { ArrowUpRight } from "lucide-react";

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      
      {/* Top Section */}
      <div className="flex items-center justify-between">
        
        {/* Icon */}
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-50 text-green-600">
          {Icon && <Icon size={22} />}
        </div>

        {/* Arrow */}
        <ArrowUpRight
          size={20}
          className="text-gray-400"
        />
      </div>

      {/* Value */}
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-500">
          {title}
        </p>

        <h3 className="mt-1 text-2xl font-bold text-gray-800">
          {value}
        </h3>

        <p className="mt-1 text-xs text-gray-500">
          {description}
        </p>
      </div>
    </div>
  );
}