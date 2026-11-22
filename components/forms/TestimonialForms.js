"use client";

import { useActionState } from "react";
import {
  createTestimonialAction,
  updateTestimonialAction,
  setTestimonialStatusAction,
} from "@/actions/testimonials";

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

// item: { id, quote, authorName, authorDetail, consentNote, consent, sortOrder }
function Fields({ idPrefix, item }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-quote"} className="mb-1 block text-sm font-medium">
          What the person said (20 to 400 characters, their own words)
        </label>
        <textarea id={idPrefix + "-quote"} name="quote" rows={3} required minLength={20} maxLength={400}
          defaultValue={item ? item.quote : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-name"} className="mb-1 block text-sm font-medium">Name shown publicly</label>
          <input id={idPrefix + "-name"} name="authorName" type="text" required minLength={2} maxLength={80}
            defaultValue={item ? item.authorName : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-detail"} className="mb-1 block text-sm font-medium">Role or place (optional)</label>
          <input id={idPrefix + "-detail"} name="authorDetail" type="text" maxLength={80}
            defaultValue={item ? item.authorDetail : ""} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={idPrefix + "-consent-note"} className="mb-1 block text-sm font-medium">
          How the person gave consent (only staff see this)
        </label>
        <input id={idPrefix + "-consent-note"} name="consentNote" type="text" required minLength={5} maxLength={200}
          defaultValue={item ? item.consentNote : ""} className={field} />
      </div>
      <div className="flex items-start gap-2">
        <input id={idPrefix + "-consent"} name="consent" type="checkbox" value="yes" required
          defaultChecked={item ? item.consent : false} className="mt-1 h-5 w-5" />
        <label htmlFor={idPrefix + "-consent"} className="text-sm">
          I confirm that this person agreed to have these words and this name shown publicly.
        </label>
      </div>
      <div className="max-w-xs">
        <label htmlFor={idPrefix + "-order"} className="mb-1 block text-sm font-medium">Order (smaller shows first)</label>
        <input id={idPrefix + "-order"} name="sortOrder" type="number" required min={0} max={1000} step={1}
          defaultValue={item ? item.sortOrder : 100} className={field} />
      </div>
    </>
  );
}

export default function TestimonialForm() {
  const [state, formAction, pending] = useActionState(createTestimonialAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-testimonial" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save testimonial (draft)"}
      </button>
    </form>
  );
}

export function EditTestimonialForm({ item }) {
  const [state, formAction, pending] = useActionState(updateTestimonialAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="testimonialId" value={item.id} />
      <Fields idPrefix={"edit-testimonial-" + item.id} item={item} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function TestimonialStatusButton({ testimonialId, target, label }) {
  const [state, formAction, pending] = useActionState(setTestimonialStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="testimonialId" value={testimonialId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
