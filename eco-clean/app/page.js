import {
  Trash2,
  CalendarDays,
  MessageSquareWarning,
  MapPin,
  Recycle,
  Truck,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import ServiceCard from "@/components/ServiceCard";

const services = [
  {
    icon: Truck,
    title: "Waste Pickup",
    description:
      "Request a waste collection from your home and choose a convenient pickup date and time.",
    href: "/request-pickup",
  },
  {
    icon: CalendarDays,
    title: "Collection Schedule",
    description:
      "Check the waste collection schedule for your area and never miss your collection day.",
    href: "/schedule",
  },
  {
    icon: MessageSquareWarning,
    title: "Report a Problem",
    description:
      "Report overflowing bins, missed pickups, illegal dumping or other waste-related problems.",
    href: "/complaints",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      {/* <Navbar /> */}

      {/* Hero Section */}
      <Hero />

      {/* Services Section */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          {/* Section Heading */}
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex rounded-full bg-green-100 px-4 py-1.5 text-sm font-semibold text-green-700">
              Our Services
            </span>

            <h2 className="mt-4 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Smart Solutions for a Cleaner City
            </h2>

            <p className="mt-4 text-gray-600">
              EcoClean makes waste management simple, fast and transparent
              for citizens and collection teams.
            </p>
          </div>

          {/* Service Cards */}
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {services.map((service) => (
              <ServiceCard
                key={service.title}
                icon={service.icon}
                title={service.title}
                description={service.description}
                href={service.href}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Why EcoClean */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="grid items-center gap-12 lg:grid-cols-2">

            {/* Left Content */}
            <div>
              <span className="inline-flex rounded-full bg-green-100 px-4 py-1.5 text-sm font-semibold text-green-700">
                Why EcoClean?
              </span>

              <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
                Technology for a Cleaner and Greener Future
              </h2>

              <p className="mt-5 leading-7 text-gray-600">
                EcoClean connects citizens, waste collectors and
                administrators through one smart platform. From requesting
                pickups to tracking collection status, everything can be
                managed digitally.
              </p>

              <div className="mt-8 space-y-5">

                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                    <Recycle size={22} />
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900">
                      Responsible Waste Management
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      Help keep recyclable and non-recyclable waste properly
                      managed.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <MapPin size={22} />
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900">
                      Easy Pickup Tracking
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      Track your waste pickup request and see its current
                      status.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <Trash2 size={22} />
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-900">
                      Cleaner Communities
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      Report waste problems and help improve cleanliness in
                      your area.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Visual */}
            <div className="relative">
              <div className="overflow-hidden rounded-3xl bg-green-600 p-8 shadow-xl sm:p-10">

                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-green-500 opacity-50" />
                <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-green-700 opacity-50" />

                <div className="relative">

                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/20 text-white backdrop-blur">
                    <Recycle size={48} />
                  </div>

                  <h3 className="mt-8 text-2xl font-bold text-white">
                    Together We Can Make a Difference
                  </h3>

                  <p className="mt-4 leading-7 text-green-50">
                    Small actions from every citizen can create cleaner
                    streets, healthier communities and a greener environment.
                  </p>

                  <div className="mt-8 grid grid-cols-2 gap-4">

                    <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                      <p className="text-3xl font-bold text-white">
                        12K+
                      </p>
                      <p className="mt-1 text-sm text-green-100">
                        Pickup Requests
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                      <p className="text-3xl font-bold text-white">
                        95%
                      </p>
                      <p className="mt-1 text-sm text-green-100">
                        Completed
                      </p>
                    </div>

                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex rounded-full bg-green-100 px-4 py-1.5 text-sm font-semibold text-green-700">
              Simple Process
            </span>

            <h2 className="mt-4 text-3xl font-bold text-gray-900 sm:text-4xl">
              How EcoClean Works
            </h2>

            <p className="mt-4 text-gray-600">
              Managing your waste pickup takes only a few simple steps.
            </p>
          </div>

          <div className="relative mt-14 grid gap-8 md:grid-cols-4">

            {[
              {
                number: "01",
                title: "Request",
                text: "Submit a pickup request with your waste details.",
              },
              {
                number: "02",
                title: "Schedule",
                text: "Choose a suitable collection date and time.",
              },
              {
                number: "03",
                title: "Collect",
                text: "Our collector receives and handles your request.",
              },
              {
                number: "04",
                title: "Clean",
                text: "Waste is collected to help keep your area clean.",
              },
            ].map((step) => (
              <div key={step.number} className="text-center">

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-lg font-bold text-white shadow-lg">
                  {step.number}
                </div>

                <h3 className="mt-5 text-lg font-bold text-gray-900">
                  {step.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {step.text}
                </p>

              </div>
            ))}

          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">

          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Keep Your Area Clean?
          </h2>

          <p className="mx-auto mt-4 max-w-2xl leading-7 text-green-50">
            Submit your waste pickup request today and become part of a
            cleaner, smarter community.
          </p>

          <a
            href="/request-pickup"
            className="mt-8 inline-flex rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-green-700 shadow-lg transition hover:bg-green-50"
          >
            Request a Pickup
          </a>

        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}