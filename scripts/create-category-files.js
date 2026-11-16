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
  "lib/reportStatus.js",
  "lib/navigation.js",
  "models/WasteCategory.js",
  "models/WasteReport.js",
  "models/AuditLog.js",
  "components/ui/StatusBadge.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
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

write("lib/categoryRules.js", `
export const CATEGORY_STATUSES = ["ACTIVE", "INACTIVE"];

export const CATEGORY_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

// New status -> the statuses it may come from.
export const CATEGORY_STATUS_FROM = {
  ACTIVE: ["INACTIVE"],
  INACTIVE: ["ACTIVE"],
};

export const CATEGORY_REASON_REQUIRED = ["INACTIVE"];

export function categoryTargets(status) {
  return CATEGORY_STATUSES.filter((t) => CATEGORY_STATUS_FROM[t].includes(status));
}

export const MAX_MATERIALS = 30;
export const MAX_MATERIAL_LENGTH = 100;
export const FALLBACK_COLOR = "#4b5563";

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Always returns a safe colour, even if a bad value was stored directly in the database.
export function safeColor(value) {
  return isHexColor(value) ? value.toLowerCase() : FALLBACK_COLOR;
}

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// White or near-black text, whichever has the better contrast on the given background.
export function textColorFor(hex) {
  const h = safeColor(hex);
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;
  return withWhite >= withBlack ? "#ffffff" : "#111111";
}

// One item per line. Blank lines are dropped and repeats (any capitalisation) are kept once.
export function parseMaterials(text) {
  const lines = String(text == null ? "" : text)
    .split(/\\r?\\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const seen = new Set();
  const items = [];
  for (const line of lines) {
    if (line.length > MAX_MATERIAL_LENGTH) {
      return { error: "each item must be " + MAX_MATERIAL_LENGTH + " characters or fewer." };
    }
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(line);
  }
  if (items.length > MAX_MATERIALS) {
    return { error: "use no more than " + MAX_MATERIALS + " items." };
  }
  return { items };
}

export function makeCategoryKey(name) {
  return String(name == null ? "" : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
`);

write("actions/categories.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import WasteReport from "@/models/WasteReport";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import {
  CATEGORY_STATUSES,
  CATEGORY_STATUS_FROM,
  CATEGORY_REASON_REQUIRED,
  isHexColor,
  parseMaterials,
  makeCategoryKey,
} from "@/lib/categoryRules";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid category");

const fields = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  description: z.string().trim().max(300, "Description is too long (300 characters maximum)"),
  color: z.string().trim().refine(isHexColor, "Choose a valid colour"),
  sortOrder: z.coerce.number().int("Use a whole number").min(0, "Minimum order is 0").max(1000, "Maximum order is 1000"),
};

const createSchema = z.object(fields);
const updateSchema = z.object(Object.assign({ categoryId: objectId }, fields));

function readFields(formData) {
  return {
    name: String(formData.get("name") || ""),
    description: String(formData.get("description") || ""),
    color: String(formData.get("color") || ""),
    sortOrder: formData.get("sortOrder"),
  };
}

function readMaterials(formData) {
  const accepted = parseMaterials(String(formData.get("acceptedMaterials") || ""));
  if (accepted.error) return { error: "Accepted materials: " + accepted.error };
  const prohibited = parseMaterials(String(formData.get("prohibitedMaterials") || ""));
  if (prohibited.error) return { error: "Materials needing separate disposal: " + prohibited.error };
  return { accepted: accepted.items, prohibited: prohibited.items };
}

function refresh() {
  revalidatePath("/admin/categories");
  revalidatePath("/waste-segregation");
  revalidatePath("/report-garbage");
}

export async function createCategoryAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = createSchema.safeParse(readFields(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const materials = readMaterials(formData);
  if (materials.error) return { error: materials.error };
  const d = parsed.data;

  const key = makeCategoryKey(d.name);
  if (!key) return { error: "Name must contain letters or numbers" };

  try {
    await connectDB();
    const created = await WasteCategory.create({
      key: key,
      name: d.name,
      color: d.color.toLowerCase(),
      description: d.description,
      acceptedMaterials: materials.accepted,
      prohibitedMaterials: materials.prohibited,
      sortOrder: d.sortOrder,
      status: "ACTIVE",
    });
    await writeAudit({
      actor: user.id,
      action: "category.create",
      targetType: "WasteCategory",
      targetId: created._id.toString(),
      metadata: { key: key, name: d.name },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "A category with this name already exists." };
    console.error("Create category failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Category created. It is active now. Create a points earning rule for it if residents should earn points." };
}

export async function updateCategoryAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("content.publish");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const raw = Object.assign({ categoryId: String(formData.get("categoryId") || "") }, readFields(formData));
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const materials = readMaterials(formData);
  if (materials.error) return { error: materials.error };
  const d = parsed.data;

  try {
    await connectDB();
    // The key is never changed, so links and rules that refer to it keep working.
    const updated = await WasteCategory.findOneAndUpdate(
      { _id: d.categoryId },
      {
        $set: {
          name: d.name,
          color: d.color.toLowerCase(),
          description: d.description,
          acceptedMaterials: materials.accepted,
          prohibitedMaterials: materials.prohibited,
          sortOrder: d.sortOrder,
        },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "Category not found." };

    await writeAudit({
      actor: user.id,
      action: "category.update",
      targetType: "WasteCategory",
      targetId: d.categoryId,
      metadata: { name: d.name },
    });
  } catch (err) {
    console.error("Update category failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Category updated." };
}

const statusSchema = z.object({
  categoryId: objectId,
  target: z.enum(CATEGORY_STATUSES, { message: "Invalid status" }),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

export async function setCategoryStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("collections.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    categoryId: String(formData.get("categoryId") || ""),
    target: formData.get("target"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { categoryId, target, reason } = parsed.data;

  if (CATEGORY_REASON_REQUIRED.includes(target) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required to deactivate a category." };
  }

  try {
    await connectDB();

    if (target === "INACTIVE") {
      const open = await WasteReport.countDocuments({
        category: categoryId,
        deletedAt: null,
        status: { $nin: CLOSED_STATUSES },
      });
      if (open > 0) {
        return {
          error:
            "This category is used by " + open + " open report(s). Finish or close them before deactivating it.",
        };
      }
    }

    const updated = await WasteCategory.findOneAndUpdate(
      { _id: categoryId, status: { $in: CATEGORY_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This category cannot be moved to that status. Please reload." };

    await writeAudit({
      actor: user.id,
      action: "category.status." + target.toLowerCase(),
      targetType: "WasteCategory",
      targetId: categoryId,
      reason: CATEGORY_REASON_REQUIRED.includes(target) ? reason : undefined,
    });
  } catch (err) {
    console.error("Set category status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: target === "INACTIVE" ? "Category deactivated." : "Category reactivated." };
}
`);

write("components/forms/CategoryForms.js", `
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
`);

write("app/admin/(panel)/categories/page.js", `
import { redirect } from "next/navigation";
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import WasteReport from "@/models/WasteReport";
import { requireRole } from "@/lib/auth/guards";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { CATEGORY_STATUS_LABELS, safeColor, textColorFor } from "@/lib/categoryRules";
import CategoryForm, {
  EditCategoryForm,
  DeactivateCategoryForm,
  ReactivateCategoryForm,
} from "@/components/forms/CategoryForms";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Waste Categories | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const user = await requireRole(ADMIN_ROLES, "/admin/login");
  // Editing text needs content.publish. Activating or deactivating needs collections.manage.
  const canEdit = hasPermission(user.role, "content.publish");
  const canStatus = hasPermission(user.role, "collections.manage");
  if (!canEdit && !canStatus) redirect("/admin");

  let categories = [];
  const openByCategory = {};
  let loadError = false;
  try {
    await connectDB();
    categories = await WasteCategory.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await WasteReport.aggregate([
      { $match: { deletedAt: null, status: { $nin: CLOSED_STATUSES } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    counts.forEach((c) => {
      openByCategory[String(c._id)] = c.count;
    });
  } catch (err) {
    console.error("Load categories failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Waste Categories</h1>
        <p className="mt-1 text-sm text-gray-600">
          Categories appear on the public Waste Segregation guide and on the report form while they are active.
          These lists are examples that local rules may change, not universal disposal rules. A category used by open
          reports cannot be deactivated.
        </p>

        {loadError && (
          <div className="mt-4">
            <ErrorNotice>Categories could not be loaded. The database may be unavailable.</ErrorNotice>
          </div>
        )}
        {!loadError && categories.length === 0 && (
          <div className="mt-4">
            <EmptyState>No categories yet. Create the first one below.</EmptyState>
          </div>
        )}

        {categories.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Order</th>
                  <th scope="col" className="py-2 pr-4">Accepted items</th>
                  <th scope="col" className="py-2 pr-4">Open reports</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const id = c._id.toString();
                  const color = safeColor(c.color);
                  const plain = {
                    id: id,
                    name: c.name,
                    description: c.description || "",
                    color: color,
                    sortOrder: c.sortOrder || 0,
                    accepted: (c.acceptedMaterials || []).join("\\n"),
                    prohibited: (c.prohibitedMaterials || []).join("\\n"),
                  };
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4">
                        <span
                          style={{ backgroundColor: color, color: textColorFor(color) }}
                          className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
                        >
                          {c.name}
                        </span>
                        <span className="mt-1 block text-xs text-gray-600">Key: {c.key}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={c.status} label={CATEGORY_STATUS_LABELS[c.status]} />
                      </td>
                      <td className="py-2 pr-4">{c.sortOrder || 0}</td>
                      <td className="py-2 pr-4">{(c.acceptedMaterials || []).length}</td>
                      <td className="py-2 pr-4">{openByCategory[id] || 0}</td>
                      <td className="py-2">
                        <div className="space-y-2">
                          {canEdit && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Edit</summary>
                              <EditCategoryForm category={plain} />
                            </details>
                          )}
                          {canStatus && c.status === "ACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-red-800">Deactivate</summary>
                              <DeactivateCategoryForm categoryId={id} />
                            </details>
                          )}
                          {canStatus && c.status === "INACTIVE" && (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                              <ReactivateCategoryForm categoryId={id} />
                            </details>
                          )}
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

      {canEdit && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Create a category</h2>
          <CategoryForm />
        </section>
      )}
    </div>
  );
}
`);

write("app/(public)/waste-segregation/page.js", `
import connectDB from "@/lib/db/connect";
import WasteCategory from "@/models/WasteCategory";
import { bagNotice } from "@/lib/content/wasteBags";
import { safeColor, textColorFor } from "@/lib/categoryRules";

export const metadata = { title: "Waste Segregation | ECO-CLEAN" };
export const dynamic = "force-dynamic";

async function loadCategories() {
  try {
    await connectDB();
    return await WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1, name: 1 }).lean();
  } catch (err) {
    console.error("Load categories failed:", err.message);
    return null;
  }
}

export default async function WasteSegregationPage() {
  const categories = await loadCategories();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Waste Segregation Guide</h1>
      <p className="mt-2 text-sm text-gray-700">{bagNotice}</p>

      {categories === null && (
        <p role="alert" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          The segregation guide is temporarily unavailable. Please try again later.
        </p>
      )}

      {categories && categories.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          The segregation guide has not been configured yet.
        </p>
      )}

      {categories && categories.length > 0 && (
        <div className="mt-8 space-y-6">
          {categories.map((c) => {
            const color = safeColor(c.color);
            const accepted = c.acceptedMaterials || [];
            const prohibited = c.prohibitedMaterials || [];
            return (
              <section key={c._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
                <p
                  className="inline-block rounded px-2 py-1 text-xs font-semibold"
                  style={{ backgroundColor: color, color: textColorFor(color) }}
                >
                  {c.name}
                </p>
                {c.description && <p className="mt-2 text-sm text-gray-700">{c.description}</p>}
                {accepted.length > 0 && (
                  <>
                    <h2 className="mt-3 text-sm font-semibold">Potentially accepted</h2>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {accepted.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </>
                )}
                {prohibited.length > 0 && (
                  <>
                    <h2 className="mt-3 text-sm font-semibold">Needs separate approved disposal</h2>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700">
                      {prohibited.map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
`);

write("tests/unit/categoryRules.test.js", `
import { describe, it, expect } from "vitest";
import {
  CATEGORY_STATUSES,
  CATEGORY_STATUS_LABELS,
  CATEGORY_STATUS_FROM,
  CATEGORY_REASON_REQUIRED,
  MAX_MATERIALS,
  categoryTargets,
  isHexColor,
  safeColor,
  textColorFor,
  parseMaterials,
  makeCategoryKey,
} from "@/lib/categoryRules";

describe("category status", () => {
  it("has a label for every status and only real statuses in the table", () => {
    CATEGORY_STATUSES.forEach((s) => expect(CATEGORY_STATUS_LABELS[s]).toBeTruthy());
    Object.entries(CATEGORY_STATUS_FROM).forEach(([to, froms]) => {
      expect(CATEGORY_STATUSES).toContain(to);
      froms.forEach((f) => expect(CATEGORY_STATUSES).toContain(f));
    });
  });

  it("offers deactivate on an active category and reactivate on an inactive one", () => {
    expect(categoryTargets("ACTIVE")).toEqual(["INACTIVE"]);
    expect(categoryTargets("INACTIVE")).toEqual(["ACTIVE"]);
    expect(categoryTargets("MADE_UP")).toEqual([]);
  });

  it("requires a reason only to deactivate", () => {
    expect(CATEGORY_REASON_REQUIRED).toEqual(["INACTIVE"]);
  });
});

describe("colours", () => {
  it("accepts only six-digit hex colours", () => {
    ["#047857", "#ABCDEF", "#000000"].forEach((v) => expect(isHexColor(v)).toBe(true));
    ["red", "#12345", "#1234567", "047857", "url(x)", "javascript:alert(1)", "", null, undefined, 5].forEach((v) => {
      expect(isHexColor(v)).toBe(false);
    });
  });

  it("falls back to a safe colour for bad stored values", () => {
    expect(safeColor("#ABCDEF")).toBe("#abcdef");
    expect(safeColor("red; background:url(x)")).toBe("#4b5563");
    expect(safeColor(undefined)).toBe("#4b5563");
  });

  it("picks readable text for dark and light backgrounds", () => {
    expect(textColorFor("#047857")).toBe("#ffffff");
    expect(textColorFor("#000000")).toBe("#ffffff");
    expect(textColorFor("#ffffff")).toBe("#111111");
    expect(textColorFor("#facc15")).toBe("#111111");
    expect(textColorFor("not-a-colour")).toBe("#ffffff");
  });
});

describe("parseMaterials", () => {
  it("trims lines, drops blanks and repeats, and keeps the first spelling", () => {
    const r = parseMaterials("  Leaves \\n\\n Grass cuttings\\r\\nleaves\\n");
    expect(r.items).toEqual(["Leaves", "Grass cuttings"]);
  });

  it("returns an empty list for empty or missing text", () => {
    expect(parseMaterials("").items).toEqual([]);
    expect(parseMaterials(null).items).toEqual([]);
  });

  it("rejects too many items and items that are too long", () => {
    const many = Array.from({ length: MAX_MATERIALS + 1 }, (_, i) => "Item " + i).join("\\n");
    expect(parseMaterials(many).error).toBeTruthy();
    expect(parseMaterials("x".repeat(101)).error).toBeTruthy();
    expect(parseMaterials("x".repeat(100)).items).toHaveLength(1);
  });
});

describe("makeCategoryKey", () => {
  it("makes a short lowercase key from the name", () => {
    expect(makeCategoryKey("Garden Waste")).toBe("garden-waste");
    expect(makeCategoryKey("  Glass & Metal!! ")).toBe("glass-metal");
    expect(makeCategoryKey("!!!")).toBe("");
    expect(makeCategoryKey("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
});
`);

write("tests/integration/categories.test.js", `
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

import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport } from "./helpers.js";
import { signInAs, signOut, form, run } from "./actionHelpers.js";
import { createCategoryAction, updateCategoryAction, setCategoryStatusAction } from "@/actions/categories";
import WasteCategory from "@/models/WasteCategory";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function categoryForm(overrides) {
  return form(
    Object.assign(
      {
        name: "Garden waste",
        description: "Leaves and grass",
        color: "#047857",
        sortOrder: "5",
        acceptedMaterials: "Leaves\\nGrass cuttings\\nleaves",
        prohibitedMaterials: "Batteries",
      },
      overrides || {}
    )
  );
}

async function asContentManager() {
  const user = await makeUser({ role: "CONTENT_MANAGER" });
  signInAs(user);
  return user;
}

async function asOperations() {
  const user = await makeUser({ role: "OPERATIONS_MANAGER" });
  signInAs(user);
  return user;
}

function makeCategory(overrides) {
  return WasteCategory.create(
    Object.assign({ key: "green", name: "Green bag", color: "#047857", status: "ACTIVE" }, overrides || {})
  );
}

describe("createCategoryAction", () => {
  it("creates an active category with a key, clean materials and an audit entry", async () => {
    await asContentManager();
    const out = await run(() => createCategoryAction(null, categoryForm()));
    expect(out.result.success).toBeTruthy();

    const saved = await WasteCategory.findOne({ key: "garden-waste" }).lean();
    expect(saved.name).toBe("Garden waste");
    expect(saved.status).toBe("ACTIVE");
    expect(saved.acceptedMaterials).toEqual(["Leaves", "Grass cuttings"]);
    expect(saved.prohibitedMaterials).toEqual(["Batteries"]);
    expect(await AuditLog.countDocuments({ action: "category.create" })).toBe(1);
  });

  it("refuses a second category with the same name", async () => {
    await asContentManager();
    await run(() => createCategoryAction(null, categoryForm()));
    const again = await run(() => createCategoryAction(null, categoryForm()));
    expect(again.result.error).toMatch(/already exists/i);
    expect(await WasteCategory.countDocuments({})).toBe(1);
  });

  it("refuses unsafe colours, too many items and a name without letters", async () => {
    await asContentManager();
    for (const bad of ["red", "#12345", "javascript:alert(1)", "url(x)"]) {
      const out = await run(() => createCategoryAction(null, categoryForm({ color: bad })));
      expect(out.result.error).toMatch(/colour/i);
    }
    const many = Array.from({ length: 31 }, (_, i) => "Item " + i).join("\\n");
    const tooMany = await run(() => createCategoryAction(null, categoryForm({ acceptedMaterials: many })));
    expect(tooMany.result.error).toMatch(/30/);
    const noLetters = await run(() => createCategoryAction(null, categoryForm({ name: "!!!" })));
    expect(noLetters.result.error).toBeTruthy();
    expect(await WasteCategory.countDocuments({})).toBe(0);
  });

  it("refuses everyone without content.publish, and visitors", async () => {
    for (const role of ["OPERATIONS_MANAGER", "COMPLAINTS_MANAGER", "REWARDS_MANAGER", "RESIDENT", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() => createCategoryAction(null, categoryForm()));
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() => createCategoryAction(null, categoryForm()));
    expect(visitor.result.error).toMatch(/permission/i);
    expect(await WasteCategory.countDocuments({})).toBe(0);
  });
});

describe("updateCategoryAction", () => {
  function updateForm(id, overrides) {
    return categoryForm(Object.assign({ categoryId: String(id), name: "Green bag renamed" }, overrides || {}));
  }

  it("updates the text and colour but never the key", async () => {
    const cat = await makeCategory();
    await asContentManager();
    const out = await run(() => updateCategoryAction(null, updateForm(cat._id, { color: "#1d4ed8" })));
    expect(out.result.success).toBeTruthy();
    const saved = await WasteCategory.findById(cat._id).lean();
    expect(saved.name).toBe("Green bag renamed");
    expect(saved.color).toBe("#1d4ed8");
    expect(saved.key).toBe("green");
    expect(await AuditLog.countDocuments({ action: "category.update" })).toBe(1);
  });

  it("refuses an operations manager, a bad colour, a bad id and an unknown category", async () => {
    const cat = await makeCategory();
    await asOperations();
    const a = await run(() => updateCategoryAction(null, updateForm(cat._id)));
    expect(a.result.error).toMatch(/permission/i);

    await asContentManager();
    const b = await run(() => updateCategoryAction(null, updateForm(cat._id, { color: "blue" })));
    expect(b.result.error).toMatch(/colour/i);
    const c = await run(() => updateCategoryAction(null, updateForm("not-an-id")));
    expect(c.result.error).toMatch(/invalid/i);
    const d = await run(() => updateCategoryAction(null, updateForm("507f1f77bcf86cd799439011")));
    expect(d.result.error).toMatch(/not found/i);
    expect((await WasteCategory.findById(cat._id).lean()).name).toBe("Green bag");
  });
});

describe("setCategoryStatusAction", () => {
  function statusForm(id, target, reason) {
    return form({ categoryId: String(id), target: target, reason: reason });
  }

  it("deactivates with a reason and reactivates", async () => {
    const cat = await makeCategory();
    await asOperations();

    const none = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE")));
    expect(none.result.error).toMatch(/at least 10/);
    const short = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "no")));
    expect(short.result.error).toMatch(/at least 10/);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");

    const ok = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "This bag colour is being replaced"))
    );
    expect(ok.result.success).toBeTruthy();
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("INACTIVE");

    const twice = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Trying to deactivate it again"))
    );
    expect(twice.result.error).toMatch(/cannot be moved/i);

    const back = await run(() => setCategoryStatusAction(null, statusForm(cat._id, "ACTIVE")));
    expect(back.result.success).toBeTruthy();
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
    expect(await AuditLog.countDocuments({ action: "category.status.inactive" })).toBe(1);
  });

  it("does not deactivate a category that open reports still use", async () => {
    const cat = await makeCategory();
    const resident = await makeUser();
    await makeReport(resident._id, cat._id, "SUBMITTED");
    await asOperations();
    const out = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Trying to retire this category"))
    );
    expect(out.result.error).toMatch(/open report/i);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
  });

  it("allows deactivating when every report is closed", async () => {
    const cat = await makeCategory();
    const resident = await makeUser();
    await makeReport(resident._id, cat._id, "COLLECTED");
    await asOperations();
    const out = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "All pickups are finished already"))
    );
    expect(out.result.success).toBeTruthy();
  });

  it("refuses a content manager, a resident and a visitor", async () => {
    const cat = await makeCategory();
    for (const role of ["CONTENT_MANAGER", "RESIDENT", "COMPLAINTS_MANAGER"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const out = await run(() =>
        setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "I should not be allowed to do this"))
      );
      expect(out.result.error).toMatch(/permission/i);
    }
    signOut();
    const visitor = await run(() =>
      setCategoryStatusAction(null, statusForm(cat._id, "INACTIVE", "Nobody is logged in here"))
    );
    expect(visitor.result.error).toMatch(/permission/i);
    expect((await WasteCategory.findById(cat._id).lean()).status).toBe("ACTIVE");
  });
});
`);

// ---- Sidebar link (one line, with a backup) ----
const navFile = "lib/navigation.js";
const navAnchor = '{ href: "/admin/zones", label: "Service Zones" },';
const navLine = '{ href: "/admin/categories", label: "Waste Categories" },';
let navState = "";
{
  const src = fs.readFileSync(navFile, "utf8");
  if (src.includes('"/admin/categories"')) {
    navState = "already";
  } else if (src.split(navAnchor).length - 1 !== 1) {
    navState = "skipped";
  } else {
    const backupDir = "scripts/backup-categories";
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, "lib__navigation.js.bak");
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    fs.writeFileSync(navFile, src.replace(navAnchor, navAnchor + eol + "      " + navLine), "utf8");
    navState = "wired";
  }
}
console.log("\nSidebar link: " + navState.toUpperCase() + " (" + navFile + ")");
if (navState === "skipped") {
  console.log("WARNING: the sidebar link was NOT added. Add this line under Service Zones in lib/navigation.js:");
  console.log("  " + navLine);
}

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
    if ((src.match(/requireActionPermission\(/g) || []).length < 3) problems.push("every action must check permission");
    if (!src.includes('"content.publish"') || !src.includes('"collections.manage"')) problems.push("missing a permission");
  }
  if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) problems.push("missing use client");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(src)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "app/admin/(panel)/categories/page.js") {
    if (!src.includes('"content.publish"') || !src.includes('"collections.manage"')) problems.push("missing permission checks");
    if (!src.includes("safeColor")) problems.push("colour must go through safeColor");
  }
  if (f === "app/(public)/waste-segregation/page.js" && !src.includes("safeColor")) {
    problems.push("public page must use safeColor");
  }
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (navState === "wired" && !fs.readFileSync(navFile, "utf8").includes('"/admin/categories"')) {
  console.log(" FAIL (sidebar link not found after writing): " + navFile);
  failed++;
}

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Next: npm test, npm run test:integration, npm run build.");