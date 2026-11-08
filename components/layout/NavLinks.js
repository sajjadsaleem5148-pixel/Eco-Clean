"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "@/lib/navActive";

export default function NavLinks({ groups, label }) {
  const pathname = usePathname();
  const ref = useRef(null);

  // The mobile menu is a details element: close it after the visitor picks a page.
  useEffect(() => {
    const details = ref.current ? ref.current.closest("details") : null;
    if (details) details.open = false;
  }, [pathname]);

  return (
    <nav ref={ref} aria-label={label}>
      {groups.map((group, i) => (
        <div key={group.title || i} className="mb-4">
          {group.title && (
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</p>
          )}
          <ul>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      "block min-h-10 rounded-md border-l-4 px-3 py-2 text-sm " +
                      (active
                        ? "border-emerald-700 bg-emerald-50 font-semibold text-emerald-950"
                        : "border-transparent text-gray-800 hover:bg-gray-100")
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
