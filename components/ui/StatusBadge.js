import { toneFor } from "@/lib/statusTone";

const STYLES = {
  neutral: "border-gray-300 bg-gray-100 text-gray-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-800",
  info: "border-blue-300 bg-blue-50 text-blue-900",
};

// The text label is always shown, so meaning never depends on colour alone.
export default function StatusBadge({ status, label }) {
  const tone = toneFor(status);
  return (
    <span className={"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold " + STYLES[tone]}>
      <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />
      {label || status}
    </span>
  );
}
