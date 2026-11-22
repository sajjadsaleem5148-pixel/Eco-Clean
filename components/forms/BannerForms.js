"use client";

import { useActionState } from "react";
import { createBannerAction, updateBannerAction, setBannerStatusAction } from "@/actions/banners";

const field = "min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
const button = "min-h-11 rounded-md bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50";
const smallButton = "min-h-11 rounded-md border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50";

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

// banner: { id, title, text, linkUrl, linkLabel, startDate, endDate, sortOrder }
function Fields({ idPrefix, banner }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={3} maxLength={80}
          defaultValue={banner ? banner.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-text"} className="mb-1 block text-sm font-medium">Text (10 to 200 characters)</label>
        <textarea id={idPrefix + "-text"} name="text" rows={2} required minLength={10} maxLength={200}
          defaultValue={banner ? banner.text : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-link"} className="mb-1 block text-sm font-medium">
            Link (optional): a path like /rewards or a full https:// address
          </label>
          <input id={idPrefix + "-link"} name="linkUrl" type="text" maxLength={200}
            defaultValue={banner ? banner.linkUrl : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-label"} className="mb-1 block text-sm font-medium">Link label (default: Learn more)</label>
          <input id={idPrefix + "-label"} name="linkLabel" type="text" maxLength={30}
            defaultValue={banner ? banner.linkLabel : ""} className={field} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={idPrefix + "-start"} className="mb-1 block text-sm font-medium">Start date (optional)</label>
          <input id={idPrefix + "-start"} name="startDate" type="date"
            defaultValue={banner ? banner.startDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-end"} className="mb-1 block text-sm font-medium">End date (optional)</label>
          <input id={idPrefix + "-end"} name="endDate" type="date"
            defaultValue={banner ? banner.endDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-order"} className="mb-1 block text-sm font-medium">Order (smaller shows first)</label>
          <input id={idPrefix + "-order"} name="sortOrder" type="number" required min={0} max={1000} step={1}
            defaultValue={banner ? banner.sortOrder : 100} className={field} />
        </div>
      </div>
    </>
  );
}

export default function BannerForm() {
  const [state, formAction, pending] = useActionState(createBannerAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-banner" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save banner (draft)"}
      </button>
    </form>
  );
}

export function EditBannerForm({ banner }) {
  const [state, formAction, pending] = useActionState(updateBannerAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="bannerId" value={banner.id} />
      <Fields idPrefix={"edit-banner-" + banner.id} banner={banner} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function BannerStatusButton({ bannerId, target, label }) {
  const [state, formAction, pending] = useActionState(setBannerStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="bannerId" value={bannerId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
