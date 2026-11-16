"use client";

import { useActionState } from "react";
import { saveContactSettingsAction } from "@/actions/settings";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

// values: object with every field key. socials: [{ key, label }]
export default function SettingsForm({ values, socials }) {
  const [state, formAction, pending] = useActionState(saveContactSettingsAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="st-email" className="mb-1 block text-sm font-medium">Public email</label>
        <input id="st-email" name="contactEmail" type="email" maxLength={200} defaultValue={values.contactEmail} className={field} />
      </div>
      <div>
        <label htmlFor="st-phone" className="mb-1 block text-sm font-medium">Public phone number</label>
        <input id="st-phone" name="contactPhone" type="tel" maxLength={25} defaultValue={values.contactPhone} className={field} />
      </div>
      <div>
        <label htmlFor="st-address" className="mb-1 block text-sm font-medium">Office address</label>
        <textarea id="st-address" name="address" rows={3} maxLength={300} defaultValue={values.address} className={field} />
      </div>
      <div>
        <label htmlFor="st-hours" className="mb-1 block text-sm font-medium">Opening hours</label>
        <input id="st-hours" name="openingHours" type="text" maxLength={200} defaultValue={values.openingHours} className={field} />
      </div>
      <fieldset className="space-y-4 rounded-md border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold">Social links (full https:// addresses)</legend>
        {socials.map((s) => (
          <div key={s.key}>
            <label htmlFor={"st-" + s.key} className="mb-1 block text-sm font-medium">{s.label}</label>
            <input id={"st-" + s.key} name={s.key} type="url" maxLength={200} defaultValue={values[s.key]} className={field} />
          </div>
        ))}
      </fieldset>
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>
      )}
      {state?.success && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{state.success}</p>
      )}
      <button type="submit" disabled={pending}
        className="min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {pending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
