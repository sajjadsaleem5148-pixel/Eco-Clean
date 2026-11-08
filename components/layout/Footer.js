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
