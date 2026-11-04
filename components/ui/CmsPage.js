import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import { PAGE_KEYS } from "@/lib/pageKeys";

export default async function CmsPage({ pageKey }) {
  const meta = PAGE_KEYS[pageKey];
  let page = null;
  let loadError = false;

  try {
    await connectDB();
    page = await WebsitePage.findOne({ key: pageKey, status: "PUBLISHED" })
      .select("title body publishedAt")
      .lean();
  } catch (err) {
    console.error("Load CMS page failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      {loadError && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{meta.label}</h1>
          <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            This page is temporarily unavailable. Please try again later.
          </p>
        </>
      )}

      {!loadError && !page && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{meta.label}</h1>
          <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            This page has not been published yet.
          </p>
        </>
      )}

      {!loadError && page && (
        <>
          <h1 className="text-3xl font-bold text-emerald-900">{page.title}</h1>
          {page.publishedAt && (
            <p className="mt-1 text-xs text-gray-600">
              Last updated: {new Date(page.publishedAt).toISOString().slice(0, 10)}
            </p>
          )}
          <div className="mt-6 whitespace-pre-wrap text-sm leading-6 text-gray-800">{page.body}</div>
        </>
      )}
    </main>
  );
}
