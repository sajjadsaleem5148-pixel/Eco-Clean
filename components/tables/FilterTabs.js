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
            "rounded-md border px-3 py-2 " +
            (item.active ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
