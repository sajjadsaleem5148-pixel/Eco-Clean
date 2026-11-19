const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/auth/guards.js",
  "lib/audit/log.js",
  "lib/permissions/roles.js",
  "models/AuditLog.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/tables/FilterTabs.js",
  "tests/integration/helpers.js",
  "tests/integration/actionHelpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/vendorRules.js", `
// Fresh produce is deliberately not a category: it needs supplier, expiry and storage controls first.
export const VENDOR_CATEGORIES = {
  PLANTS: "Plants and seedlings",
  GARDENING: "Gardening supplies",
  CLEANING: "Cleaning essentials",
  SEGREGATION_KITS: "Waste-separation kits",
  RECYCLING: "Recycling supplies",
  COMPOSTING: "Composting equipment",
  COMMUNITY: "Community-improvement supplies",
  OTHER: "Other",
};

export const VENDOR_STATUSES = ["PENDING", "APPROVED", "INACTIVE"];

export const VENDOR_STATUS_LABELS = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const VENDOR_STATUS_FROM = {
  APPROVED: ["PENDING", "INACTIVE"],
  INACTIVE: ["PENDING", "APPROVED"],
};

export const VENDOR_REASON_REQUIRED = ["INACTIVE"];

export function vendorTargets(status) {
  return Object.keys(VENDOR_STATUS_FROM).filter((t) => VENDOR_STATUS_FROM[t].includes(status));
}

export function vendorTargetLabel(current, target) {
  if (target === "APPROVED") return current === "PENDING" ? "Approve vendor" : "Reactivate vendor";
  if (target === "INACTIVE") return "Deactivate vendor";
  return target;
}

export const PHONE_PATTERN = /^[+]?[0-9 ()-]{6,25}$/;

export function isPlainEmail(value) {
  return typeof value === "string" && value.length <= 200 && /^[^\\s@<>"]+@[^\\s@<>"]+\\.[^\\s@<>"]+$/.test(value);
}

export function normalizeName(value) {
  return String(value == null ? "" : value).replace(/\\s+/g, " ").trim();
}

// Capitals, spaces and punctuation are ignored, so two spellings of one name are the same vendor.
export function nameKeyOf(value) {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hasContact(vendor) {
  return Boolean(vendor && ((vendor.email && vendor.email.length > 0) || (vendor.phone && vendor.phone.length > 0)));
}
`);

write("models/Vendor.js", `
import mongoose from "mongoose";
import { VENDOR_CATEGORIES, VENDOR_STATUSES } from "@/lib/vendorRules";

const vendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameKey: { type: String, required: true, unique: true },
    category: { type: String, enum: Object.keys(VENDOR_CATEGORIES), required: true, index: true },
    contactPerson: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 25 },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: VENDOR_STATUSES, default: "PENDING", index: true },
    statusReason: { type: String, maxlength: 300 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Vendor || mongoose.model("Vendor", vendorSchema);
`);

write("actions/vendors.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import Vendor from "@/models/Vendor";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_FROM,
  VENDOR_REASON_REQUIRED,
  PHONE_PATTERN,
  isPlainEmail,
  normalizeName,
  nameKeyOf,
  hasContact,
} from "@/lib/vendorRules";

const vendorId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid vendor");

const shared = {
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(120, "Name is too long")
    .refine((v) => nameKeyOf(v).length > 0, "Name must contain letters or numbers"),
  category: z.enum(Object.keys(VENDOR_CATEGORIES), { message: "Please choose a category" }),
  contactPerson: z.string().trim().max(120, "Contact person is too long"),
  email: z
    .string()
    .trim()
    .max(200, "Email is too long")
    .refine((v) => v === "" || isPlainEmail(v), "Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(25, "Phone number is too long")
    .refine((v) => v === "" || PHONE_PATTERN.test(v), "Enter a valid phone number"),
  address: z.string().trim().max(300, "Address is too long (300 characters maximum)"),
  notes: z.string().trim().max(300, "Notes are too long (300 characters maximum)"),
};

const createSchema = z.object(shared);
const updateSchema = z.object(Object.assign({ vendorId: vendorId }, shared));

function readFields(formData) {
  return {
    name: String(formData.get("name") || ""),
    category: formData.get("category"),
    contactPerson: String(formData.get("contactPerson") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    address: String(formData.get("address") || ""),
    notes: String(formData.get("notes") || ""),
  };
}

function refresh() {
  revalidatePath("/admin/vendors");
}

export async function createVendorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const created = await Vendor.create({
      name: normalizeName(d.name),
      nameKey: nameKeyOf(d.name),
      category: d.category,
      contactPerson: d.contactPerson,
      email: d.email.toLowerCase(),
      phone: d.phone,
      address: d.address,
      notes: d.notes,
      status: "PENDING",
      createdBy: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "vendor.create",
      targetType: "Vendor",
      targetId: created._id.toString(),
      metadata: { name: created.name, category: d.category },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A vendor with this name already exists." };
    console.error("Create vendor failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vendor added as pending. Approve it when its details are checked." };
}

export async function updateVendorAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = updateSchema.safeParse(
    Object.assign({ vendorId: String(formData.get("vendorId") || "") }, readFields(formData))
  );
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await connectDB();
    const updated = await Vendor.findOneAndUpdate(
      { _id: d.vendorId, deletedAt: null },
      {
        $set: {
          name: normalizeName(d.name),
          nameKey: nameKeyOf(d.name),
          category: d.category,
          contactPerson: d.contactPerson,
          email: d.email.toLowerCase(),
          phone: d.phone,
          address: d.address,
          notes: d.notes,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Vendor not found." };

    await writeAudit({
      actor: user.id,
      action: "vendor.update",
      targetType: "Vendor",
      targetId: d.vendorId,
      metadata: { name: normalizeName(d.name) },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A vendor with this name already exists." };
    console.error("Update vendor failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Vendor updated." };
}

const statusSchema = z.object({
  vendorId: vendorId,
  target: z.enum(VENDOR_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long (300 characters maximum)").optional(),
});

export async function setVendorStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    vendorId: String(formData.get("vendorId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { vendorId: id, target, reason } = parsed.data;

  if (!VENDOR_STATUS_FROM[target]) return { error: "This vendor cannot be moved to that status." };

  const needsReason = VENDOR_REASON_REQUIRED.includes(target);
  if (needsReason && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a vendor." };
  }

  try {
    await connectDB();

    const filter = { _id: id, deletedAt: null, status: { $in: VENDOR_STATUS_FROM[target] } };
    let update;
    if (target === "APPROVED") {
      const vendor = await Vendor.findOne({ _id: id, deletedAt: null }).select("email phone").lean();
      if (!vendor) return { error: "Vendor not found." };
      if (!hasContact(vendor)) return { error: "Add an email or a phone number before approving this vendor." };
      // The contact check is part of the update filter too, so it cannot be skipped by a race.
      filter.$or = [{ email: { $exists: true, $ne: "" } }, { phone: { $exists: true, $ne: "" } }];
      update = {
        $set: { status: "APPROVED", approvedBy: user.id, approvedAt: new Date() },
        $unset: { statusReason: "" },
      };
    } else {
      update = { $set: { status: target, statusReason: reason } };
    }

    const updated = await Vendor.findOneAndUpdate(filter, update, { returnDocument: "after" }).select("_id");
    if (!updated) return { error: "This vendor cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "vendor.status." + target.toLowerCase(),
      targetType: "Vendor",
      targetId: id,
      reason: needsReason ? reason : undefined,
    });
  } catch (err) {
    console.error("Set vendor status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "APPROVED" ? "Vendor approved." : "Vendor deactivated." };
}
`);

write("components/forms/VendorForms.js", `
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
`);

write("app/admin/(panel)/vendors/page.js", `
import connectDB from "@/lib/db/connect";
import Vendor from "@/models/Vendor";
import { requirePermission } from "@/lib/auth/guards";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_REASON_REQUIRED,
  vendorTargets,
  vendorTargetLabel,
} from "@/lib/vendorRules";
import VendorForm, { EditVendorForm, VendorStatusForm } from "@/components/forms/VendorForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";
import FilterTabs from "@/components/tables/FilterTabs";

export const metadata = { title: "Vendors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function href(status) {
  return "/admin/vendors" + (status ? "?status=" + status : "");
}

export default async function AdminVendorsPage({ searchParams }) {
  await requirePermission("rewards.manage");
  const sp = await searchParams;
  const status = VENDOR_STATUSES.includes(sp?.status) ? sp.status : null;

  const filter = { deletedAt: null };
  if (status) filter.status = status;

  let vendors = [];
  let loadError = false;
  try {
    await connectDB();
    vendors = await Vendor.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  } catch (err) {
    console.error("Load vendors failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(VENDOR_CATEGORIES).map(([value, label]) => ({ value, label }));
  const tabs = [{ label: "All", href: href(null), active: !status }].concat(
    VENDOR_STATUSES.map((s) => ({ label: VENDOR_STATUS_LABELS[s], href: href(s), active: status === s }))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <p className="mt-1 text-sm text-gray-600">
          This is the list of suppliers. A new vendor is pending until staff approve it. Vendors are not linked to
          reward products yet. Only enter details that are real and checked.
        </p>

        <div className="mt-4">
          <FilterTabs label="Status filter" items={tabs} />
        </div>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Vendors could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && vendors.length === 0 && (
          <div className="mt-4">
            <EmptyState>No vendors match this filter.</EmptyState>
          </div>
        )}

        {vendors.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Vendor</th>
                  <th scope="col" className="py-2 pr-4">Supplies</th>
                  <th scope="col" className="py-2 pr-4">Contact</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => {
                  const id = v._id.toString();
                  const plain = {
                    id: id,
                    name: v.name,
                    category: v.category,
                    contactPerson: v.contactPerson || "",
                    email: v.email || "",
                    phone: v.phone || "",
                    address: v.address || "",
                    notes: v.notes || "",
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">{v.name}</td>
                      <td className="py-2 pr-4">{VENDOR_CATEGORIES[v.category] || v.category}</td>
                      <td className="py-2 pr-4">
                        {v.contactPerson && <span className="block">{v.contactPerson}</span>}
                        {v.email && <span className="block break-all">{v.email}</span>}
                        {v.phone && <span className="block">{v.phone}</span>}
                        {!v.contactPerson && !v.email && !v.phone && <span className="text-gray-500">-</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={v.status} label={VENDOR_STATUS_LABELS[v.status]} />
                        {v.status === "INACTIVE" && v.statusReason && (
                          <span className="mt-1 block text-xs text-gray-600">Reason: {v.statusReason}</span>
                        )}
                      </td>
                      <td className="py-2">
                        <div className="space-y-2">
                          <details>
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                            <EditVendorForm vendor={plain} categories={categories} />
                          </details>
                          {vendorTargets(v.status).map((t) => (
                            <details key={t}>
                              <summary
                                className={
                                  "cursor-pointer text-sm font-semibold " +
                                  (t === "INACTIVE" ? "text-red-800" : "text-emerald-800")
                                }
                              >
                                {vendorTargetLabel(v.status, t)}
                              </summary>
                              <VendorStatusForm
                                vendorId={id}
                                target={t}
                                label={vendorTargetLabel(v.status, t)}
                                needsReason={VENDOR_REASON_REQUIRED.includes(t)}
                                danger={t === "INACTIVE"}
                              />
                            </details>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Add a vendor</h2>
        <VendorForm categories={categories} />
      </section>
    </div>
  );
}
`);

write("tests/unit/vendorRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  VENDOR_CATEGORIES,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_FROM,
  VENDOR_REASON_REQUIRED,
  PHONE_PATTERN,
  vendorTargets,
  vendorTargetLabel,
  isPlainEmail,
  normalizeName,
  nameKeyOf,
  hasContact,
} from "@/lib/vendorRules";

describe("vendor status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    VENDOR_STATUSES.forEach((s) => expect(VENDOR_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(VENDOR_STATUS_FROM).forEach(([to, froms]) => {
      expect(VENDOR_STATUSES).toContain(to);
      froms.forEach((f) => expect(VENDOR_STATUSES).toContain(f));
    });
  });

  it("offers the right next steps", () => {
    expect(vendorTargets("PENDING")).toEqual(["APPROVED", "INACTIVE"]);
    expect(vendorTargets("APPROVED")).toEqual(["INACTIVE"]);
    expect(vendorTargets("INACTIVE")).toEqual(["APPROVED"]);
    expect(vendorTargets("MADE_UP")).toEqual([]);
  });

  it("names the approve and reactivate buttons differently", () => {
    expect(vendorTargetLabel("PENDING", "APPROVED")).toBe("Approve vendor");
    expect(vendorTargetLabel("INACTIVE", "APPROVED")).toBe("Reactivate vendor");
    expect(vendorTargetLabel("APPROVED", "INACTIVE")).toBe("Deactivate vendor");
  });

  it("requires a reason only to deactivate", () => {
    expect(VENDOR_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });

  it("does not offer fresh produce as a category", () => {
    expect(Object.keys(VENDOR_CATEGORIES).join(" ").toLowerCase().includes("produce")).toBe(false);
    expect(Object.values(VENDOR_CATEGORIES).join(" ").toLowerCase().includes("produce")).toBe(false);
  });
});

describe("names", () => {
  it("normalises spacing", () => {
    expect(normalizeName("  Green   Gardens  ")).toBe("Green Gardens");
    expect(normalizeName(null)).toBe("");
  });

  it("treats different spellings of one name as the same key", () => {
    expect(nameKeyOf("Green Gardens Ltd")).toBe("greengardensltd");
    expect(nameKeyOf("green-gardens  LTD.")).toBe("greengardensltd");
    expect(nameKeyOf("Green Gardens Ltd 2")).not.toBe(nameKeyOf("Green Gardens Ltd"));
    expect(nameKeyOf("!!!")).toBe("");
  });
});

describe("contact details", () => {
  it("accepts normal emails and rejects odd ones", () => {
    expect(isPlainEmail("sales@example.com")).toBe(true);
    ["", "no-at-sign", "a@b", "a b@example.com", "<x>@example.com", null].forEach((v) => {
      expect(isPlainEmail(v)).toBe(false);
    });
  });

  it("accepts normal phone numbers and rejects letters", () => {
    ["+92 21 1234567", "(021) 123-4567"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(true));
    ["call me", "12", "<script>"].forEach((v) => expect(PHONE_PATTERN.test(v)).toBe(false));
  });

  it("needs an email or a phone number to count as having contact details", () => {
    expect(hasContact({ email: "a@b.co", phone: "" })).toBe(true);
    expect(hasContact({ email: "", phone: "+92 21 1234567" })).toBe(true);
    expect(hasContact({ email: "", phone: "" })).toBe(false);
    expect(hasContact({})).toBe(false);
    expect(hasContact(null)).toBe(false);
  });
});
`);

write("tests/integration/vendors.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createVendorAction, updateVendorAction, setVendorStatusAction } from "@/actions/vendors";
import Vendor from "@/models/Vendor";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function vendorForm(overrides) {
  return form(
    Object.assign(
      {
        name: "Green  Gardens Ltd",
        category: "GARDENING",
        contactPerson: "A. Khan",
        email: "Sales@Example.com",
        phone: "+92 21 1234567",
        address: "Industrial Area",
        notes: "",
      },
      overrides || {}
    )
  );
}

async function asRewardsManager() {
  const user = await makeUser({ role: "REWARDS_MANAGER" });
  signInAs(user);
  return user;
}

function makeVendor(overrides) {
  return Vendor.create(
    Object.assign(
      { name: "Eco Supplies", nameKey: "ecosupplies", category: "CLEANING", email: "eco@example.com", status: "PENDING" },
      overrides || {}
    )
  );
}

describe("createVendorAction", () => {
  it("adds a pending vendor with a clean name, lowercase email and an audit entry without contact details", async () => {
    const admin = await asRewardsManager();
    const out = await run(() => createVendorAction(null, vendorForm()));
    expect(out.result.success).toBeTruthy();

    const saved = await Vendor.findOne({}).lean();
    expect(saved.name).toBe("Green Gardens Ltd");
    expect(saved.nameKey).toBe("greengardensltd");
    expect(saved.email).toBe("sales@example.com");
    expect(saved.status).toBe("PENDING");
    expect(String(saved.createdBy)).toBe(String(admin._id));

    const logs = await AuditLog.find({ action: "vendor.create" }).lean();
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0].metadata);
    expect(text.includes("sales@example.com")).toBe(false);
    expect(text.includes("1234567")).toBe(false);
  });

  it("refuses the same name written in another way", async () => {
    await asRewardsManager();
    await run(() => createVendorAction(null, vendorForm()));
    for (const name of ["green gardens ltd", "GREEN-GARDENS LTD.", "  Green Gardens   Ltd "]) {
      const out = await run(() => createVendorAction(null, vendorForm({ name: name })));
      expect(out.result.error).toMatch(/already exists/i);
    }
    expect(await Vendor.countDocuments({})).toBe(1);
  });

  it("creates only one vendor when the same name arrives twice at the same time", async () => {
    await asRewardsManager();
    const results = await Promise.all([
      run(() => createVendorAction(null, vendorForm())),
      run(() => createVendorAction(null, vendorForm({ name: "green-gardens ltd" }))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await Vendor.countDocuments({})).toBe(1);
  });

  it("refuses a bad email, a bad phone, a symbol-only name and an unknown category", async () => {
    await asRewardsManager();
    const a = await run(() => createVendorAction(null, vendorForm({ email: "not-an-email" })));
    expect(a.result.error).toMatch(/email/i);
    const b = await run(() => createVendorAction(null, vendorForm({ phone: "call me" })));
    expect(b.result.error).toMatch(/phone/i);
    const c = await run(() => createVendorAction(null, vendorForm({ name: "!!!" })));
    expect(c.result.error).toMatch(/letters or numbers/i);
    const d = await run(() => createVendorAction(null, vendorForm({ category: "FRESH_PRODUCE" })));
    expect(d.result.error).toMatch(/category/i);
    expect(await Vendor.countDocuments({})).toBe(0);
  });

  it("refuses every role without rewards.manage, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "CONTENT_MANAGER", "COMPLAINTS_MANAGER", "READ_ONLY_ANALYST", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createVendorAction(null, vendorForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createVendorAction(null, vendorForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await Vendor.countDocuments({})).toBe(0);
  });
});

describe("updateVendorAction", () => {
  function updateForm(id, overrides) {
    return vendorForm(Object.assign({ vendorId: String(id), name: "Eco Supplies Renamed" }, overrides || {}));
  }

  it("updates the details and keeps the status", async () => {
    const v = await makeVendor({ status: "APPROVED" });
    await asRewardsManager();
    const out = await run(() => updateVendorAction(null, updateForm(v._id)));
    expect(out.result.success).toBeTruthy();
    const saved = await Vendor.findById(v._id).lean();
    expect(saved.name).toBe("Eco Supplies Renamed");
    expect(saved.nameKey).toBe("ecosuppliesrenamed");
    expect(saved.status).toBe("APPROVED");
    expect(await AuditLog.countDocuments({ action: "vendor.update" })).toBe(1);
  });

  it("refuses a name that another vendor already uses", async () => {
    await makeVendor({ name: "Taken Name", nameKey: "takenname" });
    const v = await makeVendor();
    await asRewardsManager();
    const out = await run(() => updateVendorAction(null, updateForm(v._id, { name: "taken-name" })));
    expect(out.result.error).toMatch(/already exists/i);
    expect((await Vendor.findById(v._id).lean()).name).toBe("Eco Supplies");
  });

  it("refuses a bad id, an unknown vendor and a role without permission", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const a = await run(() => updateVendorAction(null, updateForm("nope")));
    expect(a.result.error).toMatch(/invalid/i);
    const b = await run(() => updateVendorAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(b.result.error).toMatch(/not found/i);

    const other = await makeUser({ role: "CONTENT_MANAGER" });
    signInAs(other);
    const c = await run(() => updateVendorAction(null, updateForm(v._id)));
    expect(c.result.error).toMatch(/permission/i);
  });
});

describe("setVendorStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ vendorId: String(id), target: target, reason: reason });
  }

  it("approves a vendor that has contact details and records who approved it", async () => {
    const v = await makeVendor();
    const admin = await asRewardsManager();
    const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(out.result.success).toBeTruthy();
    const saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("APPROVED");
    expect(String(saved.approvedBy)).toBe(String(admin._id));
    expect(saved.approvedAt).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: "vendor.status.approved" })).toBe(1);
  });

  it("does not approve a vendor without an email or a phone number", async () => {
    const v = await makeVendor({ email: "", phone: "" });
    await asRewardsManager();
    const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(out.result.error).toMatch(/email or a phone/i);
    expect((await Vendor.findById(v._id).lean()).status).toBe("PENDING");
  });

  it("needs a real reason to deactivate, then lets the vendor be reactivated", async () => {
    const v = await makeVendor({ status: "APPROVED" });
    await asRewardsManager();

    const none = await run(() => setVendorStatusAction(null, statusForm(v._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await Vendor.findById(v._id).lean()).status).toBe("APPROVED");

    const ok = await run(() =>
      setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "Supplier stopped delivering to us"))
    );
    expect(ok.result.success).toBeTruthy();
    let saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("INACTIVE");
    expect(saved.statusReason).toBe("Supplier stopped delivering to us");

    const twice = await run(() =>
      setVendorStatusAction(null, statusForm(v._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(back.result.success).toBeTruthy();
    saved = await Vendor.findById(v._id).lean();
    expect(saved.status).toBe("APPROVED");
    expect(saved.statusReason).toBeUndefined();
  });

  it("lets only one request win when two approvals arrive at the same time", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const results = await Promise.all([
      run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED"))),
      run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED"))),
    ]);
    expect(results.filter((r) => r.result && r.result.success)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "vendor.status.approved" })).toBe(1);
  });

  it("refuses a pending status request and roles without permission", async () => {
    const v = await makeVendor();
    await asRewardsManager();
    const pending = await run(() => setVendorStatusAction(null, statusForm(v._id, "PENDING")));
    expect(pending.result.error).toMatch(/cannot be moved/i);

    for (const role of ["RESIDENT", "CONTENT_MANAGER", "OPERATIONS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => setVendorStatusAction(null, statusForm(v._id, "APPROVED")));
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await Vendor.findById(v._id).lean()).status).toBe("PENDING");
  });
});
`);

// ---- Check 3: read every file back ----
let failed = 0;
const romanUrdu = /\b(nahi|karein|banayen|ho raha|poora naam|kam az kam)\b/i;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("old placeholder");
  if (romanUrdu.test(src)) problems.push("Roman Urdu present");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env\.local/.test(src)) problems.push("tests must never reference Atlas");
  if (f.startsWith("actions/")) {
    if (!src.startsWith('"use server"')) problems.push("missing use server");
    if ((src.match(/requireActionPermission\("rewards.manage"\)/g) || []).length < 3) {
      problems.push("every action must check rewards.manage");
    }
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/vendors/page.js" && !src.includes('requirePermission("rewards.manage")')) {
    problems.push("missing page permission check");
  }
  if (f === "models/Vendor.js" && !src.includes("unique: true")) problems.push("name key must be unique");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");