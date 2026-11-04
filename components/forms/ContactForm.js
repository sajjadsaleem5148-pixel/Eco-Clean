"use client";

import { useActionState, useEffect, useRef } from "react";
import { createContactMessageAction } from "@/actions/contact";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ContactForm({ categories }) {
  const [state, formAction, pending] = useActionState(createContactMessageAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="c-name" className="mb-1 block text-sm font-medium">Your name</label>
        <input id="c-name" name="name" type="text" required minLength={2} maxLength={120} autoComplete="name" className={field} />
      </div>
      <div>
        <label htmlFor="c-email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="c-email" name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
      </div>
      <div>
        <label htmlFor="c-cat" className="mb-1 block text-sm font-medium">Category</label>
        <select id="c-cat" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="c-subject" className="mb-1 block text-sm font-medium">Subject</label>
        <input id="c-subject" name="subject" type="text" required minLength={3} maxLength={150} className={field} />
      </div>
      <div>
        <label htmlFor="c-message" className="mb-1 block text-sm font-medium">Message</label>
        <textarea id="c-message" name="message" rows={6} required minLength={10} maxLength={2000} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
