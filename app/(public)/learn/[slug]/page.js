import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicArticle } from "@/services/articles";
import { ARTICLE_CATEGORIES } from "@/lib/articleRules";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Learn | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }) {
  const { slug } = await params;

  let article = null;
  let loadError = false;
  try {
    article = await getPublicArticle(slug);
  } catch (err) {
    console.error("Load public article failed:", err.message);
    loadError = true;
  }

  if (!loadError && !article) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/learn" className="text-sm font-semibold text-emerald-800 underline">All articles</Link>

      {loadError && (
        <div className="mt-6">
          <ErrorNotice>This article is temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}

      {article && (
        <article className="mt-4">
          <p className="text-xs font-semibold text-emerald-800">{ARTICLE_CATEGORIES[article.category] || article.category}</p>
          <h1 className="mt-1 text-3xl font-bold text-emerald-900">{article.title}</h1>
          {article.publishedAt && (
            <p className="mt-1 text-xs text-gray-600">
              Published: {new Date(article.publishedAt).toISOString().slice(0, 10)}
            </p>
          )}
          <p className="mt-4 text-base text-gray-800">{article.summary}</p>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-6 text-gray-800">{article.body}</div>
          <p className="mt-8 text-xs text-gray-600">
            This is general guidance. Local rules may differ.
          </p>
        </article>
      )}
    </main>
  );
}
