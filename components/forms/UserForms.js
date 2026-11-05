"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  suspendUserAction,
  reactivateUserAction,
  createStaffAction,
  changeStaffRoleAction,
} from "@/actions/adminUsers";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const dangerButton = "min-h-11 rounded-md bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50";

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

function ReasonAndPassword({ id }) {
  return (
    <>
      <div>
        <label htmlFor={"reason-" + id} className="mb-1 block text-sm font-medium">Reason (at least 10 characters)</label>
        <input id={"reason-" + id} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor={"pw-" + id} className="mb-1 block text-sm font-medium">Your own password (to confirm)</label>
        <input id={"pw-" + id} name="adminPassword" type="password" required autoComplete="current-password" className={field} />
      </div>
    </>
  );
}

export function SuspendForm({ userId }) {
  const [state, formAction, pending] = useActionState(suspendUserAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <ReasonAndPassword id={"s-" + userId} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Suspending..." : "Suspend account"}
      </button>
    </form>
  );
}

export function ReactivateForm({ userId }) {
  const [state, formAction, pending] = useActionState(reactivateUserAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <ReasonAndPassword id={"r-" + userId} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reactivating..." : "Reactivate account"}
      </button>
    </form>
  );
}

export function StaffForm({ roles }) {
  const [state, formAction, pending] = useActionState(createStaffAction, null);
  const ref = useRef(null);

  useEffect(() => {
    if (state?.success && ref.current) ref.current.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="st-name" className="mb-1 block text-sm font-medium">Full name</label>
        <input id="st-name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="st-email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="st-email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label htmlFor="st-role" className="mb-1 block text-sm font-medium">Role</label>
        <select id="st-role" name="role" required defaultValue="" className={field}>
          <option value="" disabled>Select a role</option>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="st-password" className="mb-1 block text-sm font-medium">
          Temporary password for them (at least 12 characters)
        </label>
        <input id="st-password" name="password" type="password" required minLength={12} maxLength={72}
          autoComplete="new-password" className={field} />
      </div>
      <div>
        <label htmlFor="st-admin" className="mb-1 block text-sm font-medium">Your own password (to confirm)</label>
        <input id="st-admin" name="adminPassword" type="password" required autoComplete="current-password" className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Creating..." : "Create staff account"}
      </button>
    </form>
  );
}

export function RoleForm({ userId, roles, current }) {
  const [state, formAction, pending] = useActionState(changeStaffRoleAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label htmlFor={"role-" + userId} className="mb-1 block text-sm font-medium">New role</label>
        <select id={"role-" + userId} name="role" required defaultValue={current} className={field}>
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <ReasonAndPassword id={"c-" + userId} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Change role"}
      </button>
    </form>
  );
}
