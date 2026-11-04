"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  updateContactStatusAction,
  updateContactCategoryAction,
  replyContactAction,
} from "@/actions/adminContact";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";

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

export function ContactStatusForm({ reference, decisions }) {
  const [state, formAction, pending] = useActionState(updateContactStatusAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cs-decision" className="mb-1 block text-sm font-medium">Status change</label>
        <select id="cs-decision" name="decision" required defaultValue="" className={field}>
          <option value="" disabled>Choose</option>
          {decisions.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save status"}
      </button>
    </form>
  );
}

export function ContactCategoryForm({ reference, current, categories }) {
  const [state, formAction, pending] = useActionState(updateContactCategoryAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cc-category" className="mb-1 block text-sm font-medium">Category</label>
        <select id="cc-category" name="category" required defaultValue={current} className={field}>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save category"}
      </button>
    </form>
  );
}

export function ContactReplyForm({ reference }) {
  const [state, formAction, pending] = useActionState(replyContactAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <div>
        <label htmlFor="cr-body" className="mb-1 block text-sm font-medium">Reply (recorded only, it is not emailed)</label>
        <textarea id="cr-body" name="body" rows={4} required minLength={5} maxLength={2000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Record reply"}
      </button>
    </form>
  );
}
