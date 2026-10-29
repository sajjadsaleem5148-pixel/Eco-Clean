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
