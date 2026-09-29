import Link from "next/link";
import {
  // Facebook,
  // Instagram,
  // Twitter,
  Mail,
  Phone,
  MapPin,
  Leaf,
} from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-900 text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        
        {/* Main Footer */}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">

          {/* Brand */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600">
                <Leaf size={22} />
              </div>

              <div>
                <h2 className="text-xl font-bold">EcoClean</h2>
                <p className="text-xs text-gray-400">
                  Smart Waste Management
                </p>
              </div>
            </div>

            <p className="max-w-sm text-sm leading-6 text-gray-400">
              EcoClean helps communities manage waste collection,
              pickup requests, complaints and collection schedules
              through a smart digital platform.
            </p>

            {/* Social Icons */}
            <div className="mt-5 flex gap-3">
              <a
                href="#"
                className="rounded-lg bg-gray-800 p-2.5 text-gray-400 transition hover:bg-green-600 hover:text-white"
                aria-label="Facebook"
              >
                {/* <Facebook size={18} /> */}
              </a>

              <a
                href="#"
                className="rounded-lg bg-gray-800 p-2.5 text-gray-400 transition hover:bg-green-600 hover:text-white"
                aria-label="Instagram"
              >
                {/* <Instagram size={18} /> */}
              </a>

              <a
                href="#"
                className="rounded-lg bg-gray-800 p-2.5 text-gray-400 transition hover:bg-green-600 hover:text-white"
                aria-label="Twitter"
              >
                {/* <Twitter size={18} /> */}
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider">
              Quick Links
            </h3>

            <ul className="space-y-3 text-sm text-gray-400">
              <li>
                <Link
                  href="/"
                  className="transition hover:text-green-400"
                >
                  Home
                </Link>
              </li>

              <li>
                <Link
                  href="/services"
                  className="transition hover:text-green-400"
                >
                  Services
                </Link>
              </li>

              <li>
                <Link
                  href="/schedule"
                  className="transition hover:text-green-400"
                >
                  Collection Schedule
                </Link>
              </li>

              <li>
                <Link
                  href="/about"
                  className="transition hover:text-green-400"
                >
                  About Us
                </Link>
              </li>

              <li>
                <Link
                  href="/contact"
                  className="transition hover:text-green-400"
                >
                  Contact Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider">
              Services
            </h3>

            <ul className="space-y-3 text-sm text-gray-400">
              <li>Waste Pickup</li>
              <li>Collection Schedule</li>
              <li>Waste Tracking</li>
              <li>Complaint Reporting</li>
              <li>Smart Notifications</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider">
              Contact
            </h3>

            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <MapPin
                  size={18}
                  className="mt-0.5 shrink-0 text-green-500"
                />

                <span>
                  EcoClean Service Center
                  <br />
                  Your City, Pakistan
                </span>
              </li>

              <li className="flex items-center gap-3">
                <Phone
                  size={18}
                  className="shrink-0 text-green-500"
                />

                <span>+92 300 1234567</span>
              </li>

              <li className="flex items-center gap-3">
                <Mail
                  size={18}
                  className="shrink-0 text-green-500"
                />

                <span>support@ecoclean.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="mt-10 flex flex-col gap-3 border-t border-gray-800 pt-6 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} EcoClean. All rights reserved.
          </p>

          <div className="flex gap-5">
            <Link
              href="#"
              className="transition hover:text-gray-300"
            >
              Privacy Policy
            </Link>

            <Link
              href="#"
              className="transition hover:text-gray-300"
            >
              Terms & Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}