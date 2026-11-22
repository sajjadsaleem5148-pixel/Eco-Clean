import Link from "next/link";
import connectDB from "@/lib/db/connect";
import Article from "@/models/Article";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import {
  ARTICLE_STATUSES,
  ARTICLE_STATUS_LABELS,
  ARTICLE_TARGET_LABELS,
  ARTICLE_CATEGORIES,
  articleTargets,
} from "@/lib/articleRules";
import ArticleForm, { EditArticleForm, ArticleStatusButton } from "@/components/forms/ArticleForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Content Library | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/content" + (status ? "?status=" + status : "");
}

export default async function AdminContentPage({ searchParams }) {
  await requirePermission("content.publish");
  const sp = await searchParams;
  const status = ARTICLE_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let items = [];
  let loadError = false;
  try {
    await connectDB();
    items = await Article.find(filter).sort({ createdAt: -1 }).limit(100).populate("publishedBy", "name").lean();
  } catch (err) {
    console.error("Load articles failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(ARTICLE_CATEGORIES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    ARTICLE_STATUSES.map((s) => ({ label: ARTICLE_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Content Library</h1>
        <p className="mt-1 text-sm text-gray-600">
          Educational articles for the public Learn page. Only published articles are public. An article can be edited only
          while it is a draft, and its web address never changes. Text is plain text. Images are not part of this version.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Articles could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && items.length === 0 && (
          <div className="mt-4">
            <EmptyState>No articles match this filter.</EmptyState>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-3">
            {items.map((a) => {
              const id = a._id.toString();
              const plain = { id: id, title: a.title, summary: a.summary, body: a.body, category: a.category };
              return (
                <li key={id} className="rounded-md border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <StatusBadge status={a.status} label={ARTICLE_STATUS_LABELS[a.status]} />
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{a.summary}</p>
                  <p className="mt-2 text-xs text-gray-600">
                    {ARTICLE_CATEGORIES[a.category] || a.category} | Address: /learn/{a.slug}
                    {a.publishedAt ? " | Published " + formatDateTime(a.publishedAt) : ""}
                    {a.publishedBy ? " by " + a.publishedBy.name : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    {articleTargets(a.status).map((t) => (
                      <ArticleStatusButton key={t} articleId={id} target={t} label={ARTICLE_TARGET_LABELS[t]} />
                    ))}
                    {a.status === "PUBLISHED" && (
                      <Link href={"/learn/" + a.slug} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline">
                        View public page
                      </Link>
                    )}
                  </div>
                  {a.status === "DRAFT" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                      <EditArticleForm article={plain} categories={categories} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Write an article</h2>
        <ArticleForm categories={categories} />
      </section>
    </div>
  );
}
