"use client";

import { useState } from "react";

const services = [
  {
    color: "green",
    icon: "🟢",
    title: "Organic Waste",
    bin: "Green Bin",
    description:
      "Food scraps, vegetable peels, fruit waste aur doosra organic waste is bin mein rakhein.",
    examples: "Food waste • Fruit & vegetable peels • Garden waste",
  },
  {
    color: "blue",
    icon: "🔵",
    title: "Recyclable Waste",
    bin: "Blue Bin",
    description:
      "Plastic bottles, cardboard, paper, cans aur doosri recyclable cheezen is bin mein rakhein.",
    examples: "Plastic • Paper • Cardboard • Cans",
  },
  {
    color: "yellow",
    icon: "🟡",
    title: "General Waste",
    bin: "Yellow Bin",
    description:
      "Aisa waste jo organic ya recyclable nahi hai, usay yellow bin mein rakhein.",
    examples: "Other household waste • Non-recyclable items",
  },
];

export default function ServicesPage() {
  const [selectedService, setSelectedService] = useState(null);

  return (
    <main className="min-h-screen bg-gray-50">

      {/* ================= HERO ================= */}
      <section className="bg-green-700 px-6 py-20 text-center text-white">
        <div className="mx-auto max-w-4xl">

          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-green-200">
            EcoClean Pakistan
          </p>

          <h1 className="text-4xl font-bold md:text-5xl">
            Smart Waste Management Services
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-green-100">
            Waste ko sahi tareeqay se separate karein, EcoClean truck ko
            har 3 din baad pickup ke liye bulayein aur Pakistan ko clean
            banane mein apna role ada karein.
          </p>

        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="px-6 py-16">

        <div className="mx-auto max-w-6xl">

          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-800">
              EcoClean Kaise Kaam Karta Hai?
            </h2>

            <p className="mt-3 text-gray-600">
              Sirf 3 simple steps mein apna waste manage karein.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">

            {/* Step 1 */}
            <div className="rounded-2xl bg-white p-7 text-center shadow-md">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
                🗑️
              </div>

              <h3 className="text-xl font-bold text-gray-800">
                1. Waste Separate Karein
              </h3>

              <p className="mt-3 text-gray-600">
                Apne waste ko Green, Blue aur Yellow bins mein alag alag
                rakhein.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl bg-white p-7 text-center shadow-md">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl">
                🚛
              </div>

              <h3 className="text-xl font-bold text-gray-800">
                2. Truck Har 3 Din Baad
              </h3>

              <p className="mt-3 text-gray-600">
                EcoClean collection truck har 3 din baad aapke area mein
                waste collect karega.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl bg-white p-7 text-center shadow-md">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100 text-3xl">
                ♻️
              </div>

              <h3 className="text-xl font-bold text-gray-800">
                3. Waste Recycling
              </h3>

              <p className="mt-3 text-gray-600">
                Collected waste ko proper processing aur recycling ke liye
                bheja jayega.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ================= 3 BINS ================= */}
      <section className="bg-white px-6 py-16">

        <div className="mx-auto max-w-6xl">

          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-gray-800">
              Hamare 3 Waste Bins
            </h2>

            <p className="mt-3 text-gray-600">
              Har waste ko uske correct bin mein rakhein.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">

            {services.map((service) => (
              <div
                key={service.title}
                className="overflow-hidden rounded-2xl bg-gray-50 shadow-md transition hover:-translate-y-1 hover:shadow-xl"
              >

                {/* Bin */}
                <div
                  className={`flex h-48 items-center justify-center ${
                    service.color === "green"
                      ? "bg-green-100"
                      : service.color === "blue"
                      ? "bg-blue-100"
                      : "bg-yellow-100"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-7xl">
                      {service.icon}
                    </div>

                    <p className="mt-3 text-lg font-bold text-gray-800">
                      {service.bin}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">

                  <h3 className="text-xl font-bold text-gray-800">
                    {service.title}
                  </h3>

                  <p className="mt-3 text-gray-600">
                    {service.description}
                  </p>

                  <p className="mt-4 text-sm font-medium text-gray-500">
                    {service.examples}
                  </p>

                  <button
                    onClick={() => setSelectedService(service)}
                    className="mt-5 w-full rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
                  >
                    Learn More
                  </button>

                </div>
              </div>
            ))}

          </div>
        </div>
      </section>

      {/* ================= IMPORTANT RULE ================= */}
      <section className="px-6 py-16">

        <div className="mx-auto max-w-5xl rounded-2xl bg-red-50 p-8 text-center">

          <div className="text-5xl">⚠️</div>

          <h2 className="mt-4 text-2xl font-bold text-red-700">
            Important Collection Rule
          </h2>

          <p className="mx-auto mt-4 max-w-3xl text-gray-700">
            Agar waste mix hua hua hai aur Green, Blue aur Yellow waste
            properly separate nahi kiya gaya, to EcoClean collection truck
            waste collect nahi karega.
          </p>

          <p className="mt-4 font-semibold text-red-600">
            Separate Waste = Successful Pickup ♻️
          </p>

        </div>
      </section>

      {/* ================= 3 DAY COLLECTION ================= */}
      <section className="bg-green-700 px-6 py-16 text-white">

        <div className="mx-auto max-w-5xl text-center">

          <div className="text-6xl">🚛</div>

          <h2 className="mt-5 text-3xl font-bold">
            Collection Every 3 Days
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-green-100">
            EcoClean truck har 3 din baad scheduled areas mein visit karega.
            Aap apna separated waste ready rakhein.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">

            <div className="rounded-xl bg-white/10 p-5">
              <div className="text-3xl">🗓️</div>
              <p className="mt-2 font-semibold">
                Regular Schedule
              </p>
              <p className="mt-1 text-sm text-green-100">
                Har 3 din collection
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-5">
              <div className="text-3xl">📍</div>
              <p className="mt-2 font-semibold">
                Location Based
              </p>
              <p className="mt-1 text-sm text-green-100">
                Aapke area ke schedule ke mutabiq
              </p>
            </div>

            <div className="rounded-xl bg-white/10 p-5">
              <div className="text-3xl">♻️</div>
              <p className="mt-2 font-semibold">
                Responsible Recycling
              </p>
              <p className="mt-1 text-sm text-green-100">
                Waste ko proper processing
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="px-6 py-16 text-center">

        <h2 className="text-3xl font-bold text-gray-800">
          Ready to Keep Your Area Clean?
        </h2>

        <p className="mx-auto mt-3 max-w-2xl text-gray-600">
          Waste ko separate karein aur EcoClean ke saath responsible
          waste management ka hissa banein.
        </p>

        <a
          href="/request-pickup"
          className="mt-7 inline-block rounded-lg bg-green-600 px-8 py-3 font-semibold text-white hover:bg-green-700"
        >
          Request a Pickup
        </a>

      </section>

      {/* ================= MODAL ================= */}
      {selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">

          <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl">

            <div className="text-center">
              <div className="text-6xl">
                {selectedService.icon}
              </div>

              <h2 className="mt-4 text-2xl font-bold text-gray-800">
                {selectedService.title}
              </h2>

              <p className="mt-4 text-gray-600">
                {selectedService.description}
              </p>

              <div className="mt-5 rounded-lg bg-gray-50 p-4 text-left">
                <p className="font-semibold text-gray-700">
                  Examples:
                </p>

                <p className="mt-2 text-gray-600">
                  {selectedService.examples}
                </p>
              </div>

              <button
                onClick={() => setSelectedService(null)}
                className="mt-6 w-full rounded-lg bg-gray-800 px-5 py-3 font-semibold text-white hover:bg-gray-900"
              >
                Close
              </button>

            </div>

          </div>
        </div>
      )}

    </main>
  );
}




