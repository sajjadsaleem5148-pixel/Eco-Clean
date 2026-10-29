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
