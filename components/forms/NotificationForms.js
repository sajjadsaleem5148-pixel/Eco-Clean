"use client";

import { useActionState } from "react";
import { markReadAction, markAllReadAction } from "@/actions/notifications";

const smallButton = "min-h-10 rounded-md border border-emerald-700 px-3 py-1 text-sm font-semibold text-emerald-900 disabled:opacity-50";

export function MarkReadButton({ id }) {
  const [state, formAction, pending] = useActionState(markReadAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : "Mark as read"}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}

export function MarkAllReadButton() {
  const [state, formAction, pending] = useActionState(markAllReadAction, null);

  return (
    <form action={formAction} className="inline-block">
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : "Mark all as read"}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
