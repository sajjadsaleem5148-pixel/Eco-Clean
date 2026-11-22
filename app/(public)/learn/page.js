import Link from "next/link";
import { listPublicArticles } from "@/services/articles";
import { ARTICLE_CATEGORIES } from "@/lib/articleRules";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Learn | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let items = [];
  let loadError = false;
  try {
    items = await listPublicArticles();
  } catch (err) {
    console.error("Load public articles failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Learn</h1>
      <p className="mt-2 text-sm text-gray-700">
        General guidance on waste and community cleanliness. Local rules may differ, so follow instructions from your
        local authority where they exist.
      </p>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>Articles are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}
      {!loadError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState>No articles have been published yet.</EmptyState>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-6 space-y-4">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{ARTICLE_CATEGORIES[a.category] || a.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/learn/" + a.slug} className="text-emerald-900 underline">{a.title}</Link>
              </h2>
              <p className="mt-1 text-sm text-gray-700">{a.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
