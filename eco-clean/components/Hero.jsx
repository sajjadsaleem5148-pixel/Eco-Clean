import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Leaf,
  Truck,
} from "lucide-react";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-green-50 via-white to-emerald-50">
      {/* Background Decoration */}
      <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-green-100 opacity-60 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-emerald-100 opacity-60 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 md:py-24 lg:grid-cols-2 lg:px-8">
        
        {/* Left Content */}
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
            <Leaf size={16} />
            Smart & Sustainable Waste Management
          </div>

          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            Keep Your City
            <span className="block text-green-600">
              Clean & Green
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
            EcoClean makes waste management simple. Request a pickup,
            track your collection, view schedules and report waste
            problems from one smart platform.
          </p>

          {/* Buttons */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/request-pickup"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-green-200 transition hover:bg-green-700"
            >
              Request Pickup
              <ArrowRight size={18} />
            </Link>

            <Link
              href="/tracking"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3.5 font-semibold text-gray-700 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700"
            >
              Track Request
            </Link>
          </div>

          {/* Features */}
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2
                size={18}
                className="text-green-600"
              />
              Easy Pickup Requests
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2
                size={18}
                className="text-green-600"
              />
              Real-Time Tracking
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2
                size={18}
                className="text-green-600"
              />
              Collection Schedules
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2
                size={18}
                className="text-green-600"
              />
              Complaint Reporting
            </div>
          </div>
        </div>

        {/* Right Visual */}
        <div className="relative">
          <div className="relative mx-auto max-w-lg">
            
            {/* Main Card */}
            <div className="rounded-3xl border border-green-100 bg-white p-6 shadow-2xl shadow-green-100">
              
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Today's Collection
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-gray-900">
                    1,248 Pickups
                  </h2>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                  <Truck size={25} />
                </div>
              </div>

              {/* Progress */}
              <div className="mt-8">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-600">
                    Collection Progress
                  </span>

                  <span className="font-semibold text-green-600">
                    78%
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full w-[78%] rounded-full bg-green-600" />
                </div>
              </div>

              {/* Pickup Status */}
              <div className="mt-8 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-green-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-green-500" />

                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        Completed
                      </p>

                      <p className="text-xs text-gray-500">
                        Waste successfully collected
                      </p>
                    </div>
                  </div>

                  <span className="text-sm font-bold text-green-600">
                    975
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-yellow-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-yellow-500" />

                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        In Progress
                      </p>

                      <p className="text-xs text-gray-500">
                        Collectors are on the way
                      </p>
                    </div>
                  </div>

                  <span className="text-sm font-bold text-yellow-600">
                    185
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-gray-400" />

                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        Pending
                      </p>

                      <p className="text-xs text-gray-500">
                        Waiting for collection
                      </p>
                    </div>
                  </div>

                  <span className="text-sm font-bold text-gray-600">
                    88
                  </span>
                </div>
              </div>
            </div>

            {/* Floating Card */}
            <div className="absolute -bottom-6 -left-5 hidden rounded-2xl border border-green-100 bg-white p-4 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckCircle2 size={20} />
                </div>

                <div>
                  <p className="text-xs text-gray-500">
                    Service Rating
                  </p>

                  <p className="font-bold text-gray-900">
                    95% Satisfaction
                  </p>
                </div>
              </div>
            </div>

            {/* Floating Leaf */}
            <div className="absolute -right-4 -top-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-600 text-white shadow-xl shadow-green-200">
              <Leaf size={27} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}