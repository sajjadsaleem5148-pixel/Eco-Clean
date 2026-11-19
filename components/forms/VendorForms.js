"use client";

import { useActionState } from "react";
import { createVendorAction, updateVendorAction, setVendorStatusAction } from "@/actions/vendors";

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

// categories: [{ value, label }]   vendor: { id, name, category, contactPerson, email, phone, address, notes }
function VendorFields({ idPrefix, categories, vendor }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-name"} className="mb-1 block text-sm font-medium">Vendor name</label>
        <input id={idPrefix + "-name"} name="name" type="text" required minLength={2} maxLength={120}
          defaultValue={vendor ? vendor.name : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-cat"} className="mb-1 block text-sm font-medium">What they supply</label>
        <select id={idPrefix + "-cat"} name="category" required defaultValue={vendor ? vendor.category : ""} className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-600">
          Fresh produce is not offered until supplier, expiry and storage controls are set up.
        </p>
      </div>
      <div>
        <label htmlFor={idPrefix + "-person"} className="mb-1 block text-sm font-medium">Contact person (optional)</label>
        <input id={idPrefix + "-person"} name="contactPerson" type="text" maxLength={120}
          defaultValue={vendor ? vendor.contactPerson : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-email"} className="mb-1 block text-sm font-medium">Email</label>
          <input id={idPrefix + "-email"} name="email" type="email" maxLength={200}
            defaultValue={vendor ? vendor.email : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-phone"} className="mb-1 block text-sm font-medium">Phone</label>
          <input id={idPrefix + "-phone"} name="phone" type="tel" maxLength={25}
            defaultValue={vendor ? vendor.phone : ""} className={field} />
        </div>
      </div>
      <p className="text-xs text-gray-600">An email or a phone number is needed before the vendor can be approved.</p>
      <div>
        <label htmlFor={idPrefix + "-address"} className="mb-1 block text-sm font-medium">Address (optional)</label>
        <textarea id={idPrefix + "-address"} name="address" rows={2} maxLength={300}
          defaultValue={vendor ? vendor.address : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-notes"} className="mb-1 block text-sm font-medium">Notes (optional)</label>
        <input id={idPrefix + "-notes"} name="notes" type="text" maxLength={300}
          defaultValue={vendor ? vendor.notes : ""} className={field} />
      </div>
    </>
  );
}

export default function VendorForm({ categories }) {
  const [state, formAction, pending] = useActionState(createVendorAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <VendorFields idPrefix="new-vendor" categories={categories} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Add vendor"}
      </button>
    </form>
  );
}

export function EditVendorForm({ vendor, categories }) {
  const [state, formAction, pending] = useActionState(updateVendorAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="vendorId" value={vendor.id} />
      <VendorFields idPrefix={"edit-vendor-" + vendor.id} categories={categories} vendor={vendor} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function VendorStatusForm({ vendorId, target, label, needsReason, danger }) {
  const [state, formAction, pending] = useActionState(setVendorStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="target" value={target} />
      {needsReason && (
        <div>
          <label htmlFor={"vendor-reason-" + vendorId} className="mb-1 block text-sm font-medium">
            Reason (at least 10 characters)
          </label>
          <input id={"vendor-reason-" + vendorId} name="reason" type="text" required minLength={10} maxLength={300}
            className={field} />
        </div>
      )}
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={danger ? dangerButton : button}>
        {pending ? "Saving..." : label}
      </button>
    </form>
  );
}
