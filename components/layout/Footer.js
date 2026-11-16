import Link from "next/link";
import { getContactSettings } from "@/services/siteSettings";
import { telHref } from "@/lib/siteSettings";

const linkClass = "text-emerald-100 underline hover:text-white";

export default async function Footer() {
  const c = await getContactSettings();
  const hasContact = Boolean(c.email || c.phone || c.address || c.hours || c.socials.length > 0);

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
          {!hasContact && (
            <p className="mt-2 text-sm text-emerald-100">
              Contact details and social links will appear here once an administrator configures them.
            </p>
          )}
          {hasContact && (
            <ul className="mt-2 space-y-1 text-sm text-emerald-100">
              {c.email && (
                <li><a href={"mailto:" + c.email} className={linkClass}>{c.email}</a></li>
              )}
              {c.phone && (
                <li><a href={telHref(c.phone)} className={linkClass}>{c.phone}</a></li>
              )}
              {c.address && <li className="whitespace-pre-line">{c.address}</li>}
              {c.hours && <li>{c.hours}</li>}
              {c.socials.map((s) => (
                <li key={s.label}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-emerald-900 px-4 py-4 text-center text-xs text-emerald-100">
        &copy; {new Date().getFullYear()} ECO-CLEAN. All rights reserved.
      </div>
    </footer>
  );
}
