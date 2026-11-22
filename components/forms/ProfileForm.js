"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/actions/profile";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ProfileForm({ name }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="pf-name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="pf-name" name="name" type="text" required minLength={2} maxLength={120}
          autoComplete="name" defaultValue={name} className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save name"}
      </button>
    </form>
  );
}
