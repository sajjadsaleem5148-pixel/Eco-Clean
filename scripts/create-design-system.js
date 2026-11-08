const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "app/globals.css",
  "app/layout.js",
  "components/forms/LogoutButton.js",
  "components/ui/StatusBadge.js",
  "components/dashboard/StatCard.js",
  "components/tables/FilterTabs.js",
  "components/tables/Pagination.js",
  "components/layout/PortalShell.js",
  "components/layout/AuthShell.js",
  "components/layout/Footer.js",
  "lib/statusTone.js",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

// ---- Backup of the two files that are fully replaced (never overwrites an older backup) ----
const backupDir = "scripts/backup-premium-css";
fs.mkdirSync(backupDir, { recursive: true });
["app/globals.css", "app/layout.js"].forEach((f) => {
  const dest = path.join(backupDir, path.basename(f) + ".bak");
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(f, dest);
    console.log("Backup:", dest);
  } else {
    console.log("Backup already exists, kept:", dest);
  }
});

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("app/globals.css", `
@import "tailwindcss";

/* ECO-CLEAN design tokens. Changing a value here restyles every page. */
@theme {
  --color-brand: #047857;
  --color-forest: #064e3b;
  --color-charcoal: #1d211e;
  --color-surface: #f7f8f7;

  /* Neutral scale: light gray to charcoal */
  --color-gray-50: #f7f8f7;
  --color-gray-100: #eef0ee;
  --color-gray-200: #dfe3e0;
  --color-gray-300: #c8cec9;
  --color-gray-400: #9aa39c;
  --color-gray-500: #6b756d;
  --color-gray-600: #4f5852;
  --color-gray-700: #3b423d;
  --color-gray-800: #2a302c;
  --color-gray-900: #1d211e;
  --color-gray-950: #101311;

  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;

  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

@layer base {
  html {
    color-scheme: light;
  }

  body {
    background: #ffffff;
    color: var(--color-gray-900);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  h1,
  h2,
  h3 {
    color: var(--color-gray-900);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  a {
    text-underline-offset: 3px;
  }

  input,
  select,
  textarea {
    background-color: #ffffff;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--color-gray-500);
  }

  input:disabled,
  select:disabled,
  textarea:disabled {
    background-color: var(--color-gray-100);
    cursor: not-allowed;
  }

  button:disabled {
    cursor: not-allowed;
  }

  thead th {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  /* Visible keyboard focus everywhere */
  :focus-visible {
    outline: 3px solid var(--color-emerald-600);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
`);

write("app/layout.js", `
import "./globals.css";

export const metadata = {
  title: "ECO-CLEAN | Clean Your Community. Grow a Greener Future.",
  description:
    "Report garbage, follow three-bag waste segregation, track collections and earn verified Green Points.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#064e3b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);

write("lib/navActive.js", `
// Overview links must match exactly, otherwise they would look active on every sub page.
const EXACT_ONLY = ["/", "/dashboard", "/collector", "/business", "/admin"];

export function isActive(pathname, href) {
  if (!pathname || !href) return false;
  if (EXACT_ONLY.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
`);

write("tests/unit/navActive.test.js", `
import { describe, it, expect } from "vitest";
import { isActive } from "@/lib/navActive";

describe("isActive", () => {
  it("matches overview links exactly", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/users", "/admin")).toBe(false);
    expect(isActive("/dashboard/reports", "/dashboard")).toBe(false);
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
  });

  it("matches a section and its child pages", () => {
    expect(isActive("/admin/users", "/admin/users")).toBe(true);
    expect(isActive("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActive("/dashboard/reports/ECR-1", "/dashboard/reports")).toBe(true);
  });

  it("does not match a different section that shares a prefix", () => {
    expect(isActive("/admin/security-center", "/admin/security")).toBe(false);
    expect(isActive("/admin/reports", "/admin/report")).toBe(false);
  });

  it("does not match unrelated sections", () => {
    expect(isActive("/admin/orders", "/admin/users")).toBe(false);
  });

  it("returns false when a value is missing", () => {
    expect(isActive(null, "/admin")).toBe(false);
    expect(isActive("/admin", undefined)).toBe(false);
    expect(isActive("", "")).toBe(false);
  });
});
`);

write("components/ui/StatusBadge.js", `
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
`);

write("components/ui/EmptyState.js", `
export default function EmptyState({ children }) {
  return (
    <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-700">
      {children}
    </p>
  );
}
`);

write("components/ui/ErrorNotice.js", `
export default function ErrorNotice({ children }) {
  return (
    <p role="alert" className="rounded-md border border-red-300 border-l-4 border-l-red-700 bg-red-50 p-3 text-sm text-red-900">
      {children}
    </p>
  );
}
`);

write("components/dashboard/StatCard.js", `
import Link from "next/link";

export default function StatCard({ label, value, href, linkLabel = "Open" }) {
  const missing = value === null || value === undefined;
  return (
    <li className="rounded-lg border border-gray-200 border-l-4 border-l-emerald-700 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-emerald-950">
        {missing ? "-" : value}
        {missing && <span className="sr-only">not available</span>}
      </p>
      {href && (
        <Link href={href} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">
          {linkLabel}
        </Link>
      )}
    </li>
  );
}
`);

write("components/tables/FilterTabs.js", `
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
`);

write("components/tables/Pagination.js", `
import Link from "next/link";

const btn =
  "inline-flex min-h-10 items-center rounded-md border border-emerald-700 px-4 font-semibold text-emerald-900 hover:bg-emerald-50";

export default function Pagination({ page, pages, prevHref, nextHref }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? (
        <Link href={prevHref} className={btn}>Previous</Link>
      ) : (
        <span />
      )}
      <span className="text-gray-700">Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={nextHref} className={btn}>Next</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
`);

write("components/layout/NavLinks.js", `
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
`);

write("components/layout/PortalShell.js", `
import Link from "next/link";
import { Menu } from "lucide-react";
import LogoutButton from "@/components/forms/LogoutButton";
import NavLinks from "@/components/layout/NavLinks";

export default function PortalShell({ title, groups, children }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between gap-3 bg-emerald-950 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <details className="relative md:hidden">
            <summary
              aria-label="Open navigation"
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-emerald-300"
            >
              <Menu size={20} aria-hidden="true" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-gray-900 shadow-md">
              <NavLinks groups={groups} label="Mobile section navigation" />
            </div>
          </details>
          <Link href="/" className="text-lg font-bold tracking-tight">ECO-CLEAN</Link>
          <span className="hidden text-sm text-emerald-100 sm:inline">{title}</span>
        </div>
        <LogoutButton />
      </header>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-64 shrink-0 self-start border-r border-gray-200 bg-white p-3 md:sticky md:top-0 md:block md:max-h-screen md:overflow-y-auto">
          <NavLinks groups={groups} label="Section navigation" />
        </aside>
        <div className="min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}
`);

write("components/layout/AuthShell.js", `
import Link from "next/link";

export default function AuthShell({ label, children }) {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="flex items-center justify-between bg-emerald-950 px-4 py-3 text-white">
        <Link href="/" className="text-lg font-bold tracking-tight">ECO-CLEAN</Link>
        <span className="text-sm text-emerald-100">{label}</span>
      </header>
      <div className="mx-auto mt-8 max-w-lg rounded-lg border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  );
}
`);

write("components/layout/Footer.js", `
import Link from "next/link";

const linkClass = "text-emerald-100 underline hover:text-white";

export default function Footer() {
  return (
    <footer className="mt-12 bg-emerald-950 text-emerald-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold tracking-tight text-white">ECO-CLEAN</p>
          <p className="mt-2 text-sm text-emerald-100">Clean Your Community. Grow a Greener Future.</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-white">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/services" className={linkClass}>Services</Link></li>
            <li><Link href="/waste-segregation" className={linkClass}>Waste Segregation</Link></li>
            <li><Link href="/rewards" className={linkClass}>Rewards</Link></li>
            <li><Link href="/complaints" className={linkClass}>Complaints</Link></li>
            <li><Link href="/contact" className={linkClass}>Contact</Link></li>
            <li><Link href="/privacy" className={linkClass}>Privacy Policy</Link></li>
            <li><Link href="/terms" className={linkClass}>Terms</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          <p className="mt-2 text-sm text-emerald-100">
            Contact details and social links will appear here once an administrator configures them.
          </p>
        </div>
      </div>
      <div className="border-t border-emerald-900 px-4 py-4 text-center text-xs text-emerald-100">
        &copy; {new Date().getFullYear()} ECO-CLEAN. All rights reserved.
      </div>
    </footer>
  );
}
`);

// ---- Check 3: read every file back and enforce the design rules ----
`let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];

  if (!src.trim()) problems.push("empty");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");

  if (f.endsWith(".css")) {
    if (!src.includes('@import "tailwindcss"')) problems.push("missing tailwind import");
    if (!src.includes("prefers-reduced-motion")) problems.push("missing reduced-motion rule");
    if (src.includes("@keyframes")) problems.push("keyframes not allowed");
    if (/gradient\\(/i.test(src)) problems.push("gradients not allowed");
    if (/scale\\(|translate/i.test(src)) problems.push("transforms not allowed");
  } else if (f.startsWith("components/") || f.startsWith("app/")) {
    if (/animate-|hover:scale|hover:-translate|hover:translate|transition|gradient|backdrop-blur/.test(src)) {
      problems.push("animation, movement or gradient classes are not allowed");
    }
  }

  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\\nALL OK: " + written.length + " files written and checked. Next: npm test, then npm run build.");`