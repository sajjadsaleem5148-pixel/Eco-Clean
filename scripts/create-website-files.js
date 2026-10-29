const fs = require("fs");
const path = require("path");

let created = 0;
let skipped = 0;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  created++;
  console.log("Bani:", file);
}

function writeIfMissing(file, content) {
  if (fs.existsSync(file)) {
    skipped++;
    return;
  }
  write(file, content);
}

// ---------------- shared data ----------------
write("lib/navigation.js", `
export const publicNav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/waste-segregation", label: "Waste Segregation" },
  { href: "/schedule", label: "Collection Schedule" },
  { href: "/rewards", label: "Rewards" },
  { href: "/complaints", label: "Complaints" },
  { href: "/contact", label: "Contact" },
];

export const residentNav = [
  {
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/reports", label: "My Reports" },
      { href: "/dashboard/collections", label: "My Collections" },
      { href: "/dashboard/complaints", label: "My Complaints" },
      { href: "/dashboard/green-points", label: "Green Points" },
      { href: "/dashboard/rewards", label: "Rewards Store" },
      { href: "/dashboard/orders", label: "My Orders" },
      { href: "/dashboard/notifications", label: "Notifications" },
      { href: "/dashboard/household", label: "Household" },
      { href: "/dashboard/profile", label: "Profile" },
      { href: "/dashboard/settings", label: "Settings" },
    ],
  },
];

export const collectorNav = [
  {
    items: [
      { href: "/collector", label: "Home" },
      { href: "/collector/jobs", label: "My Jobs" },
      { href: "/collector/schedule", label: "Schedule" },
      { href: "/collector/history", label: "Work History" },
      { href: "/collector/notifications", label: "Notifications" },
      { href: "/collector/profile", label: "Profile" },
    ],
  },
];

export const businessNav = [
  {
    items: [
      { href: "/business", label: "Home" },
      { href: "/business/dashboard", label: "Dashboard" },
      { href: "/business/locations", label: "Locations" },
      { href: "/business/collections", label: "Collections" },
      { href: "/business/reports", label: "Reports" },
      { href: "/business/invoices", label: "Invoices" },
    ],
  },
];

export const adminNav = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/notifications", label: "Notifications" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/admin/reports", label: "Garbage Reports" },
      { href: "/admin/assignments", label: "Assignments" },
      { href: "/admin/operations-map", label: "Operations Map" },
      { href: "/admin/routes", label: "Routes" },
      { href: "/admin/schedules", label: "Schedules" },
      { href: "/admin/missed-pickups", label: "Missed Pickups" },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Residents" },
      { href: "/admin/collectors", label: "Collectors" },
      { href: "/admin/admin-staff", label: "Admin Staff" },
      { href: "/admin/roles", label: "Roles" },
    ],
  },
  {
    title: "Customer Support",
    items: [
      { href: "/admin/complaints", label: "Complaints" },
      { href: "/admin/contact-messages", label: "Contact Messages" },
      { href: "/admin/support", label: "Support Tickets" },
    ],
  },
  {
    title: "Green Rewards",
    items: [
      { href: "/admin/green-points", label: "Points Transactions" },
      { href: "/admin/points-rules", label: "Points Rules" },
      { href: "/admin/rewards", label: "Reward Products" },
      { href: "/admin/inventory", label: "Inventory" },
      { href: "/admin/orders", label: "Redemption Orders" },
      { href: "/admin/vendors", label: "Vendors" },
      { href: "/admin/campaigns", label: "Campaigns" },
    ],
  },
  {
    title: "Smart City",
    items: [
      { href: "/admin/zones", label: "Service Zones" },
      { href: "/admin/neighborhoods", label: "Neighborhoods" },
      { href: "/admin/households", label: "Households" },
      { href: "/admin/vehicles", label: "Vehicles" },
    ],
  },
  {
    title: "Website",
    items: [
      { href: "/admin/services", label: "Services" },
      { href: "/admin/content", label: "Homepage Editor" },
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/banners", label: "Banners" },
      { href: "/admin/faqs", label: "FAQs" },
      { href: "/admin/announcements", label: "Announcements" },
      { href: "/admin/media", label: "Media Library" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/exports", label: "CSV Exports" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/integrations", label: "Integrations" },
      { href: "/admin/security", label: "My Security" },
      { href: "/admin/security-center", label: "Security Center" },
      { href: "/admin/audit-logs", label: "Audit Logs" },
      { href: "/admin/backup", label: "Backup" },
    ],
  },
];
`);

write("lib/content/wasteBags.js", `
// Abhi static examples hain. Baad mein yeh WasteCategory (MongoDB) se aayenge.
export const wasteBags = [
  {
    key: "green",
    name: "Green Bag",
    type: "Organic Waste",
    badge: "bg-emerald-700",
    examples: [
      "Fruit and vegetable scraps",
      "Suitable food waste",
      "Leaves and garden waste",
      "Locally approved biodegradable materials",
    ],
  },
  {
    key: "blue",
    name: "Blue Bag",
    type: "Recyclable Waste",
    badge: "bg-blue-700",
    examples: [
      "Paper and cardboard",
      "Suitable plastic packaging",
      "Metal cans",
      "Clean glass",
      "Other locally accepted recyclables",
    ],
  },
  {
    key: "red",
    name: "Red Bag",
    type: "Residual Waste",
    badge: "bg-red-700",
    examples: [
      "Non-recyclable household waste",
      "Residual materials permitted under local disposal requirements",
    ],
  },
];

export const bagNotice =
  "These are configurable examples, not universal disposal rules. Hazardous materials, batteries, medical waste, sharps, chemicals and electronic waste need separate approved disposal procedures.";
`);

write("lib/auth/guards.js", `
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

// Login nahi -> loginPath. Login hai lekin role galat -> home. Shak ho to inkar.
export async function requireRole(allowedRoles, loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  if (!allowedRoles.includes(user.role)) redirect("/");
  return user;
}

export async function requireUser(loginPath = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}
`);

// ---------------- components ----------------
write("components/ui/PlaceholderPage.js", `
export default function PlaceholderPage({ title, route, access }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm font-medium text-emerald-800">{access}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">Route: {route}</p>
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This page is not implemented yet. The route and access rules are in
          place; the real functionality will be added in a later development step.
        </div>
      </section>
    </main>
  );
}
`);

write("components/layout/PublicNavbar.js", `
import Link from "next/link";
import { Menu, ShieldCheck } from "lucide-react";
import { publicNav } from "@/lib/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

async function safeUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

function homeFor(role) {
  if (role === "RESIDENT") return "/dashboard";
  if (role === "COLLECTOR") return "/collector";
  if (ADMIN_ROLES.includes(role)) return "/admin";
  return "/";
}

export default async function PublicNavbar() {
  const user = await safeUser();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-900">
          ECO-CLEAN
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-5 text-sm lg:flex">
          {publicNav.map((item) => (
            <Link key={item.href} href={item.href} className="text-gray-800 hover:text-emerald-800">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href={homeFor(user.role)}
              className="hidden min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:inline-flex"
            >
              My account
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden min-h-11 items-center px-3 text-sm font-semibold text-emerald-900 sm:inline-flex">
                Login
              </Link>
              <Link
                href="/register"
                className="hidden min-h-11 items-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 sm:inline-flex"
              >
                Register
              </Link>
            </>
          )}

          <Link
            href="/admin/login"
            aria-label="Admin sign-in"
            title="Admin sign-in"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-emerald-900 hover:bg-emerald-50"
          >
            <ShieldCheck size={20} aria-hidden="true" />
          </Link>

          <details className="relative lg:hidden">
            <summary
              aria-label="Open menu"
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-gray-300"
            >
              <Menu size={20} aria-hidden="true" />
            </summary>
            <nav aria-label="Mobile" className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-gray-200 bg-white p-2">
              {publicNav.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-md px-3 py-3 text-sm text-gray-900 hover:bg-emerald-50">
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-gray-200 pt-2">
                {user ? (
                  <Link href={homeFor(user.role)} className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">
                    My account
                  </Link>
                ) : (
                  <>
                    <Link href="/login" className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">Login</Link>
                    <Link href="/register" className="block rounded-md px-3 py-3 text-sm font-semibold text-emerald-900">Register</Link>
                  </>
                )}
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
`);

write("components/layout/Footer.js", `
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-emerald-950 text-emerald-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="text-lg font-bold text-white">ECO-CLEAN</p>
          <p className="mt-2 text-sm">Clean Your Community. Grow a Greener Future.</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-white">Quick links</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/services" className="underline">Services</Link></li>
            <li><Link href="/waste-segregation" className="underline">Waste Segregation</Link></li>
            <li><Link href="/campaigns" className="underline">Campaigns</Link></li>
            <li><Link href="/complaints" className="underline">Complaints</Link></li>
            <li><Link href="/contact" className="underline">Contact</Link></li>
            <li><Link href="/privacy" className="underline">Privacy Policy</Link></li>
            <li><Link href="/terms" className="underline">Terms</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-white">Contact</p>
          <p className="mt-2 text-sm">
            Contact details and social links will appear here once an
            administrator configures them.
          </p>
        </div>
      </div>
      <div className="border-t border-emerald-900 px-4 py-4 text-center text-xs">
        &copy; {new Date().getFullYear()} ECO-CLEAN. All rights reserved.
      </div>
    </footer>
  );
}
`);

write("components/layout/PortalShell.js", `
import Link from "next/link";
import { Menu } from "lucide-react";
import LogoutButton from "@/components/forms/LogoutButton";

function NavList({ groups }) {
  return (
    <nav aria-label="Section navigation">
      {groups.map((group, i) => (
        <div key={group.title || i} className="mb-4">
          {group.title && (
            <p className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">{group.title}</p>
          )}
          <ul>
            {group.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-md px-2 py-2 text-sm text-gray-800 hover:bg-emerald-50">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function PortalShell({ title, groups, children }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between gap-3 bg-emerald-900 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <details className="relative md:hidden">
            <summary
              aria-label="Open navigation"
              className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md border border-emerald-300"
            >
              <Menu size={20} aria-hidden="true" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-gray-900">
              <NavList groups={groups} />
            </div>
          </details>
          <Link href="/" className="font-bold">ECO-CLEAN</Link>
          <span className="text-sm text-emerald-100">{title}</span>
        </div>
        <LogoutButton />
      </header>
      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden w-64 shrink-0 self-start border-r border-gray-200 bg-white p-3 md:sticky md:top-0 md:block md:max-h-screen md:overflow-y-auto">
          <NavList groups={groups} />
        </aside>
        <div className="min-w-0 flex-1 p-4">{children}</div>
      </div>
    </div>
  );
}
`);

write("components/layout/AuthShell.js", `
import Link from "next/link";

export default function AuthShell({ label, children }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between bg-emerald-900 px-4 py-3 text-white">
        <Link href="/" className="font-bold">ECO-CLEAN</Link>
        <span className="text-sm text-emerald-100">{label}</span>
      </header>
      {children}
    </div>
  );
}
`);

// ---------------- admin login ----------------
write("actions/adminAuth.js", `
"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function adminLoginAction(prevState, formData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err; // redirect isi raste se guzarta hai
  }
}
`);

write("components/forms/AdminLoginForm.js", `
"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/actions/adminAuth";

export default function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLoginAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Signing in..." : "Sign in to Control Center"}
      </button>
    </form>
  );
}
`);

write("app/admin/(auth)/login/page.js", `
import AdminLoginForm from "@/components/forms/AdminLoginForm";

export const metadata = { title: "Admin Login | ECO-CLEAN" };

export default function AdminLoginPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-emerald-900">Staff sign-in</h1>
      <p className="mb-6 text-sm text-gray-700">
        Only staff accounts can open the Control Center. Multi-factor
        authentication is not configured yet.
      </p>
      <AdminLoginForm />
    </main>
  );
}
`);

// ---------------- layouts ----------------
write("app/(public)/layout.js", `
import PublicNavbar from "@/components/layout/PublicNavbar";
import Footer from "@/components/layout/Footer";

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <PublicNavbar />
      {children}
      <Footer />
    </div>
  );
}
`);

write("app/(auth)/layout.js", `
import AuthShell from "@/components/layout/AuthShell";

export default function AuthLayout({ children }) {
  return <AuthShell label="Account">{children}</AuthShell>;
}
`);

write("app/admin/(auth)/layout.js", `
import AuthShell from "@/components/layout/AuthShell";

export default function AdminAuthLayout({ children }) {
  return <AuthShell label="Staff sign-in">{children}</AuthShell>;
}
`);

write("app/dashboard/layout.js", `
import PortalShell from "@/components/layout/PortalShell";
import { residentNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";

export default async function ResidentLayout({ children }) {
  await requireRole(["RESIDENT"]);
  return <PortalShell title="Resident Portal" groups={residentNav}>{children}</PortalShell>;
}
`);

write("app/collector/layout.js", `
import PortalShell from "@/components/layout/PortalShell";
import { collectorNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";

export default async function CollectorLayout({ children }) {
  await requireRole(["COLLECTOR"]);
  return <PortalShell title="Collector Portal" groups={collectorNav}>{children}</PortalShell>;
}
`);

write("app/business/layout.js", `
import PortalShell from "@/components/layout/PortalShell";
import { businessNav } from "@/lib/navigation";
import { requireUser } from "@/lib/auth/guards";

// Business ka alag role abhi tay nahi hua, is liye filhal sirf login zaroori hai.
export default async function BusinessLayout({ children }) {
  await requireUser();
  return <PortalShell title="Business Portal" groups={businessNav}>{children}</PortalShell>;
}
`);

write("app/admin/(panel)/layout.js", `
import PortalShell from "@/components/layout/PortalShell";
import { adminNav } from "@/lib/navigation";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";

export default async function AdminLayout({ children }) {
  await requireRole(ADMIN_ROLES, "/admin/login");
  return <PortalShell title="Control Center" groups={adminNav}>{children}</PortalShell>;
}
`);

// ---------------- real public pages ----------------
writeIfMissing("app/(public)/page.js", `
import Link from "next/link";
import { wasteBags, bagNotice } from "@/lib/content/wasteBags";

export const metadata = {
  title: "ECO-CLEAN | Clean Your Community. Grow a Greener Future.",
  description: "Report garbage, follow three-bag segregation, track collections and earn verified Green Points.",
};

const steps = [
  { title: "Report", text: "Submit a garbage report with a description, photo and pickup location." },
  { title: "Review", text: "Authorized staff verify the report before any collector is assigned." },
  { title: "Collect", text: "A scheduled collector picks up the waste and records evidence." },
  { title: "Earn", text: "Verified, correctly segregated activity can earn Green Points." },
];

const services = [
  "Residential waste collection",
  "Community waste collection",
  "Commercial waste collection",
  "Office waste management",
  "Event cleanup",
  "Waste segregation education",
  "Recycling coordination",
  "Organic waste and composting programs",
];

export default function HomePage() {
  return (
    <main>
      <section className="bg-emerald-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h1 className="max-w-3xl text-3xl font-bold sm:text-4xl">
            Clean Your Community. Grow a Greener Future.
          </h1>
          <p className="mt-4 max-w-2xl text-emerald-50">
            ECO-CLEAN helps residents report garbage, follow a three-bag
            segregation system, track collections and earn verified Green Points.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/report-garbage" className="inline-flex min-h-11 items-center rounded-md bg-white px-5 text-sm font-semibold text-emerald-900">
              Report Garbage
            </Link>
            <Link href="/services" className="inline-flex min-h-11 items-center rounded-md border border-white px-5 text-sm font-semibold text-white">
              View Services
            </Link>
            <Link href="/rewards" className="inline-flex min-h-11 items-center rounded-md border border-white px-5 text-sm font-semibold text-white">
              Explore Rewards
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold text-emerald-900">How ECO-CLEAN works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm font-semibold text-emerald-800">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-gray-700">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-gray-100" aria-labelledby="bags">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="bags" className="text-2xl font-bold text-emerald-900">Three-bag waste segregation</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {wasteBags.map((bag) => (
              <article key={bag.key} className="rounded-lg border border-gray-200 bg-white p-5">
                <p className={"inline-block rounded px-2 py-1 text-xs font-semibold text-white " + bag.badge}>
                  {bag.name}
                </p>
                <h3 className="mt-2 text-lg font-semibold">{bag.type}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {bag.examples.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-700">{bagNotice}</p>
          <Link href="/waste-segregation" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">
            Read the full segregation guide
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="services">
        <h2 id="services" className="text-2xl font-bold text-emerald-900">Services</h2>
        <p className="mt-2 text-sm text-gray-700">
          Availability depends on your service zone. Service details are managed by administrators.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <li key={s} className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm">{s}</li>
          ))}
        </ul>
        <Link href="/services" className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline">
          All services
        </Link>
      </section>

      <section className="bg-emerald-50" aria-labelledby="rewards">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="rewards" className="text-2xl font-bold text-emerald-900">Green Rewards</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-800">
            Green Points are awarded only for verified activity, never just for uploading a photo.
            Points can be redeemed for eligible rewards while stock lasts.
          </p>
          <Link href="/rewards" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">
            Browse rewards
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12" aria-labelledby="stats">
        <h2 id="stats" className="text-2xl font-bold text-emerald-900">Community statistics</h2>
        <p className="mt-2 text-sm text-gray-700">
          No verified statistics are published yet. Figures will appear here only when they come from real, verified records.
        </p>
      </section>
    </main>
  );
}
`);

writeIfMissing("app/(public)/waste-segregation/page.js", `
import { wasteBags, bagNotice } from "@/lib/content/wasteBags";

export const metadata = { title: "Waste Segregation | ECO-CLEAN" };

export default function WasteSegregationPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Waste Segregation Guide</h1>
      <p className="mt-2 text-sm text-gray-700">{bagNotice}</p>
      <div className="mt-8 space-y-6">
        {wasteBags.map((bag) => (
          <section key={bag.key} className="rounded-lg border border-gray-200 bg-white p-5">
            <p className={"inline-block rounded px-2 py-1 text-xs font-semibold text-white " + bag.badge}>
              {bag.name}
            </p>
            <h2 className="mt-2 text-xl font-semibold">{bag.type}</h2>
            <p className="mt-2 text-sm font-medium">Potentially accepted:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {bag.examples.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
`);

// ---------------- placeholder pages for every other route ----------------
const routes = [];
function add(group, list, access) {
  list.forEach(([url, title]) => routes.push({ group, url, title, access }));
}

add("public", [
  ["/about", "About ECO-CLEAN"], ["/services", "Services"], ["/services/[slug]", "Service Details"],
  ["/rewards", "Rewards"], ["/rewards/[id]", "Reward Details"], ["/contact", "Contact"],
  ["/complaints", "Complaints"], ["/report-garbage", "Report Garbage"],
  ["/schedule", "Collection Schedule"], ["/campaigns", "Campaigns"],
  ["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"],
], "Public");

add("auth", [["/forgot-password", "Forgot Password"], ["/reset-password", "Reset Password"]], "Account");

add("portal", [
  ["/dashboard/profile", "My Profile"], ["/dashboard/reports", "My Reports"],
  ["/dashboard/reports/[id]", "Report Details"], ["/dashboard/collections", "My Collections"],
  ["/dashboard/complaints", "My Complaints"], ["/dashboard/complaints/[id]", "Complaint Details"],
  ["/dashboard/green-points", "Green Points"], ["/dashboard/rewards", "Rewards Store"],
  ["/dashboard/orders", "My Orders"], ["/dashboard/notifications", "Notifications"],
  ["/dashboard/household", "My Household"], ["/dashboard/settings", "Settings"],
], "Resident only");

add("portal", [
  ["/collector", "Collector Home"], ["/collector/jobs", "My Jobs"], ["/collector/jobs/[id]", "Job Details"],
  ["/collector/schedule", "My Schedule"], ["/collector/history", "Work History"],
  ["/collector/profile", "My Profile"], ["/collector/notifications", "Notifications"],
], "Collector only");

add("portal", [
  ["/business", "Business Home"], ["/business/dashboard", "Business Dashboard"],
  ["/business/locations", "Service Locations"], ["/business/collections", "Collections"],
  ["/business/reports", "Reports"], ["/business/invoices", "Invoices (billing not enabled)"],
], "Business portal (optional)");

add("admin-auth", [["/admin/forgot-password", "Admin Forgot Password"]], "Staff sign-in");

add("admin", [
  ["/admin", "Admin Dashboard"], ["/admin/security", "My Security (MFA)"],
  ["/admin/users", "Resident Management"], ["/admin/collectors", "Collector Management"],
  ["/admin/admin-staff", "Admin Staff"], ["/admin/roles", "Roles and Permissions"],
  ["/admin/services", "Services"], ["/admin/reports", "Garbage Reports"],
  ["/admin/assignments", "Collector Assignments"], ["/admin/operations-map", "Operations Map"],
  ["/admin/routes", "Collection Routes"], ["/admin/schedules", "Collection Schedules"],
  ["/admin/missed-pickups", "Missed Pickups"], ["/admin/zones", "Service Zones"],
  ["/admin/neighborhoods", "Neighborhoods"], ["/admin/households", "Households"],
  ["/admin/vehicles", "Vehicles"], ["/admin/complaints", "Complaints"],
  ["/admin/contact-messages", "Contact Messages"], ["/admin/support", "Support Tickets"],
  ["/admin/green-points", "Green Points Transactions"], ["/admin/points-rules", "Points Earning Rules"],
  ["/admin/rewards", "Reward Products"], ["/admin/inventory", "Inventory and Stock"],
  ["/admin/orders", "Redemption Orders"], ["/admin/vendors", "Vendors"],
  ["/admin/campaigns", "Community Campaigns"], ["/admin/content", "Homepage Editor"],
  ["/admin/pages", "Website Pages"], ["/admin/banners", "Hero Banners"], ["/admin/faqs", "FAQs"],
  ["/admin/announcements", "Announcements"], ["/admin/media", "Media Library"],
  ["/admin/analytics", "Analytics"], ["/admin/exports", "CSV Exports"],
  ["/admin/notifications", "Notifications"], ["/admin/settings", "General Settings"],
  ["/admin/integrations", "Integrations"], ["/admin/security-center", "Security Center"],
  ["/admin/audit-logs", "Audit Logs"], ["/admin/backup", "Backup and Maintenance"],
], "Admin staff (permission checks coming)");

function pageDir(r) {
  if (r.group === "public") return path.join("app", "(public)", r.url);
  if (r.group === "auth") return path.join("app", "(auth)", r.url);
  if (r.group === "admin-auth") return path.join("app", "admin", "(auth)", r.url.replace(/^\/admin/, ""));
  if (r.group === "admin") return path.join("app", "admin", "(panel)", r.url.replace(/^\/admin/, ""));
  return path.join("app", r.url);
}

routes.forEach((r) => {
  const src =
    'import PlaceholderPage from "@/components/ui/PlaceholderPage";\n\n' +
    'export const metadata = { title: "' + r.title + ' | ECO-CLEAN" };\n\n' +
    "export default function Page() {\n" +
    '  return <PlaceholderPage title="' + r.title + '" route="' + r.url + '" access="' + r.access + '" />;\n' +
    "}\n";
  writeIfMissing(path.join(pageDir(r), "page.js"), src);
});

// default Next.js home page "/" se takrata hai
if (fs.existsSync("app/page.js")) {
  fs.rmSync("app/page.js", { force: true });
  console.log("Default app/page.js hata diya");
}

console.log("\nNaye/overwrite files: " + created + " | Pehle se maujood (skip): " + skipped);