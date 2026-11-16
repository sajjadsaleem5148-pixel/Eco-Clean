"use client";

import { useActionState } from "react";
import { createCategoryAction, updateCategoryAction, setCategoryStatusAction } from "@/actions/categories";

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

// category: { id, name, description, color, sortOrder, accepted (text), prohibited (text) }
function CategoryFields({ idPrefix, category }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-name"} className="mb-1 block text-sm font-medium">Category name</label>
        <input id={idPrefix + "-name"} name="name" type="text" required minLength={2} maxLength={80}
          defaultValue={category ? category.name : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-desc"} className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id={idPrefix + "-desc"} name="description" rows={2} maxLength={300}
          defaultValue={category ? category.description : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-color"} className="mb-1 block text-sm font-medium">Colour</label>
          <input id={idPrefix + "-color"} name="color" type="color"
            defaultValue={category ? category.color : "#047857"} className="min-h-11 w-full rounded-md border border-gray-300 p-1" />
        </div>
        <div>
          <label htmlFor={idPrefix + "-order"} className="mb-1 block text-sm font-medium">Order (smaller numbers appear first)</label>
          <input id={idPrefix + "-order"} name="sortOrder" type="number" required min={0} max={1000} step={1}
            defaultValue={category ? category.sortOrder : 100} className={field} />
        </div>
      </div>
      <div>
        <label htmlFor={idPrefix + "-accepted"} className="mb-1 block text-sm font-medium">
          Potentially accepted materials (one per line, up to 30)
        </label>
        <textarea id={idPrefix + "-accepted"} name="acceptedMaterials" rows={5}
          defaultValue={category ? category.accepted : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-prohibited"} className="mb-1 block text-sm font-medium">
          Materials that need separate approved disposal (one per line, up to 30)
        </label>
        <textarea id={idPrefix + "-prohibited"} name="prohibitedMaterials" rows={4}
          defaultValue={category ? category.prohibited : ""} className={field} />
        <p className="mt-1 text-xs text-gray-600">
          Hazardous materials, batteries, medical waste, sharps, chemicals and electronic waste need separate approved
          disposal procedures. List them here, not under accepted materials.
        </p>
      </div>
    </>
  );
}

export default function CategoryForm() {
  const [state, formAction, pending] = useActionState(createCategoryAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <CategoryFields idPrefix="new-cat" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create category"}
      </button>
    </form>
  );
}

export function EditCategoryForm({ category }) {
  const [state, formAction, pending] = useActionState(updateCategoryAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="categoryId" value={category.id} />
      <CategoryFields idPrefix={"edit-cat-" + category.id} category={category} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function DeactivateCategoryForm({ categoryId }) {
  const [state, formAction, pending] = useActionState(setCategoryStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="target" value="INACTIVE" />
      <div>
        <label htmlFor={"deact-cat-" + categoryId} className="mb-1 block text-sm font-medium">
          Reason for deactivating (at least 10 characters)
        </label>
        <input id={"deact-cat-" + categoryId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={dangerButton}>
        {pending ? "Deactivating..." : "Deactivate category"}
      </button>
    </form>
  );
}

export function ReactivateCategoryForm({ categoryId }) {
  const [state, formAction, pending] = useActionState(setCategoryStatusAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="target" value="ACTIVE" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Reactivating..." : "Reactivate category"}
      </button>
    </form>
  );
}
