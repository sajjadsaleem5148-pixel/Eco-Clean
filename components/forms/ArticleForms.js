"use client";

import { useActionState } from "react";
import { createArticleAction, updateArticleAction, setArticleStatusAction } from "@/actions/articles";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const smallButton = "min-h-11 rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";

function Feedback({ state }) {
  return (
    <>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
    </>
  );
}

// categories: [{ value, label }]   article: { id, title, summary, body, category }
function Fields({ idPrefix, categories, article }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title (5 to 120 characters)</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={5} maxLength={120}
          defaultValue={article ? article.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-category"} className="mb-1 block text-sm font-medium">Category</label>
        <select id={idPrefix + "-category"} name="category" required defaultValue={article ? article.category : ""} className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={idPrefix + "-summary"} className="mb-1 block text-sm font-medium">Short summary (10 to 200 characters)</label>
        <textarea id={idPrefix + "-summary"} name="summary" rows={2} required minLength={10} maxLength={200}
          defaultValue={article ? article.summary : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-body"} className="mb-1 block text-sm font-medium">
          Article text (50 to 8000 characters, plain text; blank lines make new paragraphs)
        </label>
        <textarea id={idPrefix + "-body"} name="body" rows={10} required minLength={50} maxLength={8000}
          defaultValue={article ? article.body : ""} className={field} />
      </div>
    </>
  );
}

export default function ArticleForm({ categories }) {
  const [state, formAction, pending] = useActionState(createArticleAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-article" categories={categories} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save article (draft)"}
      </button>
    </form>
  );
}

export function EditArticleForm({ article, categories }) {
  const [state, formAction, pending] = useActionState(updateArticleAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="articleId" value={article.id} />
      <Fields idPrefix={"edit-article-" + article.id} categories={categories} article={article} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function ArticleStatusButton({ articleId, target, label }) {
  const [state, formAction, pending] = useActionState(setArticleStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
