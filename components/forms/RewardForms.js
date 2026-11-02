"use client";

import { useActionState } from "react";
import {
  createProductAction,
  setProductStatusAction,
  adjustStockAction,
  redeemRewardAction,
  cancelOwnOrderAction,
  updateOrderStatusAction,
} from "@/actions/rewards";

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

export function ProductForm({ categories, fulfillments }) {
  const [state, formAction, pending] = useActionState(createProductAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="p-name" className="mb-1 block text-sm font-medium">Product name</label>
        <input id="p-name" name="name" type="text" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="p-desc" className="mb-1 block text-sm font-medium">Description</label>
        <textarea id="p-desc" name="description" rows={3} required minLength={10} maxLength={1000} className={field} />
      </div>
      <div>
        <label htmlFor="p-benefit" className="mb-1 block text-sm font-medium">Environmental benefit (optional, keep it factual)</label>
        <input id="p-benefit" name="environmentalBenefit" type="text" maxLength={300} className={field} />
      </div>
      <div>
        <label htmlFor="p-cat" className="mb-1 block text-sm font-medium">Category</label>
        <select id="p-cat" name="category" required defaultValue="" className={field}>
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="p-ful" className="mb-1 block text-sm font-medium">Fulfillment</label>
        <select id="p-ful" name="fulfillment" required defaultValue="" className={field}>
          <option value="" disabled>Select a method</option>
          {fulfillments.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="p-price" className="mb-1 block text-sm font-medium">Price (Green Points)</label>
          <input id="p-price" name="pointsPrice" type="number" required min={1} max={100000} step={1} className={field} />
        </div>
        <div>
          <label htmlFor="p-stock" className="mb-1 block text-sm font-medium">Initial stock</label>
          <input id="p-stock" name="initialStock" type="number" required min={0} max={100000} step={1} defaultValue={0} className={field} />
        </div>
        <div>
          <label htmlFor="p-low" className="mb-1 block text-sm font-medium">Low-stock threshold</label>
          <input id="p-low" name="lowStockThreshold" type="number" required min={0} max={100000} step={1} defaultValue={5} className={field} />
        </div>
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Create product (draft)"}
      </button>
    </form>
  );
}

export function ProductStatusButton({ productId, target, label }) {
  const [state, formAction, pending] = useActionState(setProductStatusAction, null);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="target" value={target} />
      <button type="submit" disabled={pending} className={smallButton}>
        {pending ? "..." : label}
      </button>
      {state?.error && <p role="alert" className="mt-1 text-xs text-red-800">{state.error}</p>}
    </form>
  );
}

export function StockForm({ productId }) {
  const [state, formAction, pending] = useActionState(adjustStockAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <div>
        <label htmlFor={"s-delta-" + productId} className="mb-1 block text-sm font-medium">
          Change (plus to add stock, minus to deduct, for example -3)
        </label>
        <input id={"s-delta-" + productId} name="delta" type="number" required step={1} className={field} />
      </div>
      <div>
        <label htmlFor={"s-reason-" + productId} className="mb-1 block text-sm font-medium">Reason (at least 10 characters)</label>
        <input id={"s-reason-" + productId} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Update stock"}
      </button>
    </form>
  );
}

export function RedeemForm({ productId, price, idempotencyKey }) {
  const [state, formAction, pending] = useActionState(redeemRewardAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div>
        <label htmlFor="r-note" className="mb-1 block text-sm font-medium">Pickup or delivery note (optional)</label>
        <input id="r-note" name="note" type="text" maxLength={200} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Redeeming..." : "Redeem for " + price + " points"}
      </button>
    </form>
  );
}

export function CancelOrderForm({ orderNumber }) {
  const [state, formAction, pending] = useActionState(cancelOwnOrderAction, null);

  return (
    <form action={formAction} className="mt-2 space-y-3">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <div>
        <label htmlFor={"c-reason-" + orderNumber} className="mb-1 block text-sm font-medium">
          Why are you cancelling? (at least 10 characters)
        </label>
        <input id={"c-reason-" + orderNumber} name="reason" type="text" required minLength={10} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Cancelling..." : "Cancel order and refund points"}
      </button>
    </form>
  );
}

export function OrderStatusForm({ orderNumber, statuses }) {
  const [state, formAction, pending] = useActionState(updateOrderStatusAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <div>
        <label htmlFor="o-status" className="mb-1 block text-sm font-medium">New status</label>
        <select id="o-status" name="status" required defaultValue="" className={field}>
          <option value="" disabled>Choose a status</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="o-reason" className="mb-1 block text-sm font-medium">
          Note (required to reject or cancel, at least 10 characters; the resident can see it)
        </label>
        <textarea id="o-reason" name="reason" rows={2} maxLength={300} className={field} />
      </div>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving..." : "Save status"}
      </button>
    </form>
  );
}
