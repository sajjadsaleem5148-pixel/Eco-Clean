"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  savePageDraftAction,
  pageStatusAction,
  createAnnouncementAction,
  setAnnouncementStatusAction,
} from "@/actions/pages";

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

export function PageDraftForm({ pageKey, title, body }) {
  const [state, formAction, pending] = useActionState(savePageDraftAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="key" value={pageKey} />
      <div>
        <label htmlFor={"pt-" + pageKey} className="mb-1 block text-sm font-medium">Page title</label>
        <input id={"pt-" + pageKey} name="title" type="text" required minLength={3} maxLength={150}
          defaultValue={title} className={field} />
      </div>
      <div>
        <label htmlFor={"pb-" + pageKey} className="mb-1 block text-sm font-medium">
          Text (plain text; blank lines make new paragraphs)
        </label>
        <textarea id={"pb-" + pageKey} name="body" rows={10} required minLength={20} maxLength={20000}
          defaultValue={body} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save draft"}
      </button>
    </form>
  );
}

export function PageStatusButton({ pageKey, op, label }) {
  const [state, formAction, pending] = useActionState(pageStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="key" value={pageKey} />
      <input type="hidden" name="op" value={op} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}

export function AnnouncementForm() {
  const [state, formAction, pending] = useActionState(createAnnouncementAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="an-title" className="mb-1 block text-sm font-medium">Title</label>
        <input id="an-title" name="title" type="text" required minLength={3} maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="an-body" className="mb-1 block text-sm font-medium">Message (up to 300 characters)</label>
        <textarea id="an-body" name="body" rows={3} required minLength={5} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create announcement (draft)"}
      </button>
    </form>
  );
}

export function AnnouncementStatusButton({ id, target, label }) {
  const [state, formAction, pending] = useActionState(setAnnouncementStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
