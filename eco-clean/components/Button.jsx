"use client";

import { Loader2 } from "lucide-react";

export default function Button({
  children,
  type = "button",
  onClick,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
}) {
  const variants = {
    primary:
      "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",

    secondary:
      "bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400",

    outline:
      "border border-gray-300 bg-white text-gray-700 hover:border-green-500 hover:bg-green-50 hover:text-green-700 focus:ring-green-500",

    danger:
      "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",

    success:
      "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500",
  };

  const sizes = {
    sm: "px-3 py-2 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
    >
      {/* Loading Spinner */}
      {loading && <Loader2 size={18} className="animate-spin" />}

      {/* Button Text */}
      {children}
    </button>
  );
}