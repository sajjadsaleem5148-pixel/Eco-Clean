import Link from "next/link";

// items: [{ label, href, active }]
export default function FilterTabs({ label, items }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 text-sm">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={
            "inline-flex min-h-10 items-center rounded-full border px-4 " +
            (item.active
              ? "border-emerald-800 bg-emerald-800 font-semibold text-white"
              : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100")
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
