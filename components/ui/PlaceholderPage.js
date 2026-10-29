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
