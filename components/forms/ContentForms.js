"use client";

import { useActionState, useEffect, useRef } from "react";
import { createServiceAction, createFaqAction, setContentStatusAction } from "@/actions/content";

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

export function ServiceForm({ categories, eligibles }) {
  const [state, formAction, pending] = useActionState(createServiceAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="sv-title" className="mb-1 block text-sm font-medium">Title</label>
        <input id="sv-title" name="title" type="text" required minLength={3} maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="sv-desc" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="sv-desc" name="description" rows={4} required minLength={20} maxLength={2000} className={field} />
      </div>
      <div>
        <label htmlFor="sv-cat" className="mb-1 block text-sm font-medium">Category</label>
        <select id="sv-cat" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sv-elig" className="mb-1 block text-sm font-medium">Eligible customers</label>
        <select id="sv-elig" name="eligibleCustomer" required defaultValue="ALL" className={field}>
          {eligibles.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="sv-avail" className="mb-1 block text-sm font-medium">Availability (optional, for example which zones)</label>
        <input id="sv-avail" name="availability" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="sv-instr" className="mb-1 block text-sm font-medium">Collection instructions (optional)</label>
        <textarea id="sv-instr" name="collectionInstructions" rows={3} maxLength={1000} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create service (draft)"}
      </button>
    </form>
  );
}

export function FaqForm() {
  const [state, formAction, pending] = useActionState(createFaqAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="fq-q" className="mb-1 block text-sm font-medium">Question</label>
        <input id="fq-q" name="question" type="text" required minLength={5} maxLength={200} className={field} />
      </div>
      <div>
        <label htmlFor="fq-a" className="mb-1 block text-sm font-medium">Answer</label>
        <textarea id="fq-a" name="answer" rows={4} required minLength={10} maxLength={2000} className={field} />
      </div>
      <div>
        <label htmlFor="fq-o" className="mb-1 block text-sm font-medium">Order (smaller numbers appear first)</label>
        <input id="fq-o" name="sortOrder" type="number" required min={0} max={100000} step={1} defaultValue={100} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create FAQ (draft)"}
      </button>
    </form>
  );
}

export function ContentStatusButton({ kind, id, target, label }) {
  const [state, formAction, pending] = useActionState(setContentStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
