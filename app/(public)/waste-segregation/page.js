import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import { bagNotice } from "@/lib/content/wasteBags";
import { safeColor, textColorFor } from "@/lib/categoryRules";

export const metadata = { title: "Waste Segregation | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function loadCategories() {
  try {
    await connectDB();
    return await WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1, name: 1 }).lean();
  } catch (err) {
    console.error("Load categories failed:", err.message);
    return null;
  }
}

export default async function WasteSegregationPage() {
  const categories = await loadCategories();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Waste Segregation Guide</h1>
      <p className="mt-2 text-sm text-gray-700">{bagNotice}</p>

      {categories === null && (
        <p role="alert" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The segregation guide is temporarily unavailable. Please try again later.
        </p>
      )}

      {categories && categories.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          The segregation guide has not been configured yet.
        </p>
      )}

      {categories && categories.length > 0 && (
        <div className="mt-8 space-y-6">
          {categories.map((c) => {
            const color = safeColor(c.color);
            const accepted = c.acceptedMaterials || [];
            const prohibited = c.prohibitedMaterials || [];
            return (
              <section key={c._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
                <p
                  className="inline-block rounded px-2 py-1 text-xs font-semibold"
                  style={{ backgroundColor: color, color: textColorFor(color) }}
                >
                  {c.name}
                </p>
                {c.description && <p className="mt-2 text-sm text-gray-700">{c.description}</p>}
                {accepted.length > 0 && (
                  <>
                    <h2 className="mt-3 text-sm font-semibold">Potentially accepted</h2>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {accepted.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </>
                )}
                {prohibited.length > 0 && (
                  <>
                    <h2 className="mt-3 text-sm font-semibold">Needs separate approved disposal</h2>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {prohibited.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
