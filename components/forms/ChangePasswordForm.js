"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/actions/security";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" required
          autoComplete="current-password" className={field} />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">New password (at least 12 characters)</label>
        <input id="newPassword" name="newPassword" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium">Confirm new password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      <p className="text-xs text-gray-600">After a password change you will be signed out everywhere and must log in again.</p>
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
