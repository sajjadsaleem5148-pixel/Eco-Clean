import {
  Leaf,
  Recycle,
  Users,
  Truck,
  ShieldCheck,
  Target,
} from "lucide-react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-green-700 px-6 py-16 text-white">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
            <Leaf size={34} />
          </div>

          <h1 className="mt-6 text-4xl font-bold">
            About EcoClean
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-green-100">
            EcoClean is a smart waste management system designed
            to make waste collection easier, faster and more
            organized for citizens and collection teams.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-green-600">
              Our Mission
            </span>

            <h2 className="mt-2 text-3xl font-bold text-gray-800">
              Building Cleaner & Greener Communities
            </h2>

            <p className="mt-4 leading-7 text-gray-600">
              EcoClean connects citizens with waste collection
              services through a simple digital platform. Users
              can request pickups, check collection schedules,
              track requests and report cleanliness problems.
            </p>

            <p className="mt-4 leading-7 text-gray-600">
              Administrators can manage users, collectors,
              pickup requests, complaints and collection
              schedules from one centralized dashboard.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Target size={28} />
            </div>

            <h3 className="mt-5 text-xl font-bold text-gray-800">
              Our Goal
            </h3>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              To create a transparent and technology-driven waste
              management experience where citizens, collectors
              and administrators can work together efficiently.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-green-600">
              What We Provide
            </span>

            <h2 className="mt-2 text-3xl font-bold text-gray-800">
              Smart Waste Management
            </h2>

            <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500">
              Everything needed to organize and manage modern
              waste collection services.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Pickup */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Truck size={24} />
              </div>

              <h3 className="mt-4 font-semibold text-gray-800">
                Waste Pickup
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Citizens can easily request waste collection from
                their location.
              </p>
            </div>

            {/* Recycling */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Recycle size={24} />
              </div>

              <h3 className="mt-4 font-semibold text-gray-800">
                Waste Categories
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Different waste types can be organized and
                managed through the system.
              </p>
            </div>

            {/* Users */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <Users size={24} />
              </div>

              <h3 className="mt-4 font-semibold text-gray-800">
                User Management
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Administrators can manage citizens and collection
                staff from one dashboard.
              </p>
            </div>

            {/* Security */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-600">
                <ShieldCheck size={24} />
              </div>

              <h3 className="mt-4 font-semibold text-gray-800">
                Secure System
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Authentication and role-based access help protect
                system data and functionality.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Simple Stats */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="rounded-xl bg-green-600 p-6 text-center text-white">
            <h3 className="text-3xl font-bold">24/7</h3>
            <p className="mt-1 text-sm text-green-100">
              Digital Access
            </p>
          </div>

          <div className="rounded-xl bg-green-600 p-6 text-center text-white">
            <h3 className="text-3xl font-bold">3</h3>
            <p className="mt-1 text-sm text-green-100">
              User Roles
            </p>
          </div>

          <div className="rounded-xl bg-green-600 p-6 text-center text-white">
            <h3 className="text-3xl font-bold">100%</h3>
            <p className="mt-1 text-sm text-green-100">
              Digital Management
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}