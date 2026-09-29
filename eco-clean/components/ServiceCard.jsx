import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ServiceCard({
  icon: Icon,
  title,
  description,
  href,
}) {
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-green-200 hover:shadow-lg">
      {/* Icon */}
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600 transition group-hover:bg-green-600 group-hover:text-white">
        {Icon && <Icon size={26} />}
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold text-gray-900">
        {title}
      </h3>

      {/* Description */}
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-gray-600">
        {description}
      </p>

      {/* Link */}
      <Link
        href={href}
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-green-600 transition hover:text-green-700"
      >
        Learn More
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </Link>
    </div>
  );
}