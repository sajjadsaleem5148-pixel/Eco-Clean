"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  awardReportPointsAction,
  adjustPointsAction,
  reverseTransactionAction,
  saveRuleAction,
} from "@/actions/points";

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

export function AwardForm({ reportId, points }) {
  const [state, formAction, pending] = useActionState(awardReportPointsAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="reportId" value={reportId} />
      <div>
        <label htmlFor={"award-reason-" + reportId} className="mb-1 block text-sm font-medium">
          Verification note (the resident can see it, at least 10 characters)
        </label>
        <input id={"award-reason-" + reportId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-5 w-5" />
        <span>I confirm that this collection and its waste segregation were verified.</span>
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Awarding..." : "Award " + points + " points"}
      </button>
    </form>
  );
}

export function AdjustForm() {
  const [state, formAction, pending] = useActionState(adjustPointsAction, null);
  const [key, setKey] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (state?.success) {
      if (ref.current) ref.current.reset();
      setKey(crypto.randomUUID());
    }
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={key} />
      <div>
        <label htmlFor="adj-email" className="mb-1 block text-sm font-medium">Resident email</label>
        <input id="adj-email" name="email" type="email" required className={field} />
      </div>
      <div>
        <label htmlFor="adj-points" className="mb-1 block text-sm font-medium">
          Points (use a minus sign to deduct, for example -20)
        </label>
        <input id="adj-points" name="points" type="number" required step={1} className={field} />
      </div>
      <div>
        <label htmlFor="adj-reason" className="mb-1 block text-sm font-medium">
          Reason (the resident can see it, at least 10 characters)
        </label>
        <input id="adj-reason" name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="adj-password" className="mb-1 block text-sm font-medium">Your own password (to confirm)</label>
        <input id="adj-password" name="adminPassword" type="password" required autoComplete="current-password" className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending || !key} className={button}>
        {pending ? "Saving..." : "Record adjustment"}
      </button>
    </form>
  );
}

export function ReverseForm({ transactionId }) {
  const [state, formAction, pending] = useActionState(reverseTransactionAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="transactionId" value={transactionId} />
      <div>
        <label htmlFor={"rev-reason-" + transactionId} className="mb-1 block text-sm font-medium">
          Reason for reversing (at least 10 characters)
        </label>
        <input id={"rev-reason-" + transactionId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor={"rev-pw-" + transactionId} className="mb-1 block text-sm font-medium">Your own password</label>
        <input id={"rev-pw-" + transactionId} name="adminPassword" type="password" required autoComplete="current-password" className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reversing..." : "Reverse"}
      </button>
    </form>
  );
}

export function RuleForm({ categories }) {
  const [state, formAction, pending] = useActionState(saveRuleAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="rule-category" className="mb-1 block text-sm font-medium">Waste category</label>
        <select id="rule-category" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="rule-points" className="mb-1 block text-sm font-medium">Points per verified collection</label>
        <input id="rule-points" name="points" type="number" required min={1} max={1000} step={1} className={field} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked className="h-5 w-5" />
        <span>Rule is active</span>
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save rule"}
      </button>
    </form>
  );
}
