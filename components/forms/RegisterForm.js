"use client";

import { useActionState } from "react";
import { registerAction } from "@/actions/auth";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">Poora naam</label>
        <input id="name" name="name" type="text" required autoComplete="name"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password (kam az kam 10 characters)</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password"
          className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Account ban raha hai..." : "Account banayen"}
      </button>
    </form>
  );
}
