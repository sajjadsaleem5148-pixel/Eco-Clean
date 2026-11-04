import connectDB from "@/lib/db/connect";
import WebsitePage from "@/models/WebsitePage";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { PAGE_KEYS, PAGE_KEY_LIST, PAGE_STATUS_LABELS } from "@/lib/pageKeys";
import { PageDraftForm, PageStatusButton } from "@/components/forms/PageForms";

export const metadata = { title: "Website Pages | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  await requirePermission("content.publish");

  const docs = {};
  let loadError = false;
  try {
    await connectDB();
    const list = await WebsitePage.find({}).populate("publishedBy", "name").lean();
    list.forEach((d) => {
      docs[d.key] = d;
    });
  } catch (err) {
    console.error("Load pages failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Website Pages</h1>
        <p className="mt-1 text-sm text-gray-600">
          Write a draft, check the preview, then publish. The public page changes only when you publish.
          Privacy and Terms are legal documents: have them reviewed before publishing.
        </p>
        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Pages could not be loaded. The database may be unavailable.
          </p>
        )}
      </section>

      {!loadError &&
        PAGE_KEY_LIST.map((key) => {
          const d = docs[key];
          const status = d ? d.status : null;
          const title = d ? d.draftTitle || d.title || "" : "";
          const body = d ? d.draftBody || d.body || "" : "";
          const hasDraft = Boolean(d && d.draftTitle && d.draftBody);

          return (
            <section key={key} className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{PAGE_KEYS[key].label}</h2>
              <p className="mt-1 text-sm text-gray-700">
                Public address: {PAGE_KEYS[key].path} | Status:{" "}
                <span className="font-semibold">{status ? PAGE_STATUS_LABELS[status] : "Not created"}</span>
              </p>
              {d && d.publishedAt && (
                <p className="text-xs text-gray-600">
                  Published {formatDateTime(d.publishedAt)}
                  {d.publishedBy ? " by " + d.publishedBy.name : ""}
                </p>
              )}

              <div className="mt-4">
                <PageDraftForm pageKey={key} title={title} body={body} />
              </div>

              {hasDraft && (
                <details className="mt-4 rounded-md border border-gray-200 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Preview draft</summary>
                  <h3 className="mt-3 text-xl font-bold text-emerald-900">{d.draftTitle}</h3>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-800">{d.draftBody}</div>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {hasDraft && (
                  <PageStatusButton
                    pageKey={key}
                    op="publish"
                    label={status === "PUBLISHED" ? "Publish latest draft" : "Publish"}
                  />
                )}
                {status === "PUBLISHED" && <PageStatusButton pageKey={key} op="unpublish" label="Unpublish" />}
                {(status === "DRAFT" || status === "PUBLISHED") && (
                  <PageStatusButton pageKey={key} op="archive" label="Archive" />
                )}
              </div>
            </section>
          );
        })}
    </div>
  );
}
