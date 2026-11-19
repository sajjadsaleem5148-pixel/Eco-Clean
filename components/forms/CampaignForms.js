"use client";

import { useActionState } from "react";
import { createCampaignAction, updateCampaignAction, setCampaignStatusAction } from "@/actions/campaigns";

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

// campaign: { id, title, summary, body, startDate, endDate }
function Fields({ idPrefix, campaign }) {
  return (
    <>
      <div>
        <label htmlFor={idPrefix + "-title"} className="mb-1 block text-sm font-medium">Title</label>
        <input id={idPrefix + "-title"} name="title" type="text" required minLength={3} maxLength={120}
          defaultValue={campaign ? campaign.title : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-summary"} className="mb-1 block text-sm font-medium">Short summary (10 to 200 characters)</label>
        <textarea id={idPrefix + "-summary"} name="summary" rows={2} required minLength={10} maxLength={200}
          defaultValue={campaign ? campaign.summary : ""} className={field} />
      </div>
      <div>
        <label htmlFor={idPrefix + "-body"} className="mb-1 block text-sm font-medium">
          Details (optional, plain text; blank lines make new paragraphs)
        </label>
        <textarea id={idPrefix + "-body"} name="body" rows={5} maxLength={2000}
          defaultValue={campaign ? campaign.body : ""} className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idPrefix + "-start"} className="mb-1 block text-sm font-medium">Start date (optional)</label>
          <input id={idPrefix + "-start"} name="startDate" type="date"
            defaultValue={campaign ? campaign.startDate : ""} className={field} />
        </div>
        <div>
          <label htmlFor={idPrefix + "-end"} className="mb-1 block text-sm font-medium">End date (optional)</label>
          <input id={idPrefix + "-end"} name="endDate" type="date"
            defaultValue={campaign ? campaign.endDate : ""} className={field} />
        </div>
      </div>
    </>
  );
}

export default function CampaignForm() {
  const [state, formAction, pending] = useActionState(createCampaignAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Fields idPrefix="new-campaign" />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save campaign (draft)"}
      </button>
    </form>
  );
}

export function EditCampaignForm({ campaign }) {
  const [state, formAction, pending] = useActionState(updateCampaignAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-4">
      <input type="hidden" name="campaignId" value={campaign.id} />
      <Fields idPrefix={"edit-campaign-" + campaign.id} campaign={campaign} />
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

export function CampaignStatusButton({ campaignId, target, label }) {
  const [state, formAction, pending] = useActionState(setCampaignStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}
