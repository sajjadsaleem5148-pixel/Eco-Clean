const fs = require("fs");
const path = require("path");

// ---- Check 1: sahi folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("NAKAAM: Yeh script project ke root folder (Eco-Clean) se chalayen. Kuch nahi likha gaya.");
  process.exit(1);
}

// ---- Check 2: pichli zaroori files maujood hain? ----
const required = [
  "lib/auth/guards.js",
  "lib/security/stepUp.js",
  "lib/audit/log.js",
  "lib/permissions/roles.js",
  "lib/reportStatus.js",
  "models/User.js",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("NAKAAM: Yeh files nahi mili, pehle unki scripts chalayen:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Kuch nahi likha gaya.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Bani:", file);
}

write("lib/userAdmin.js", `
// Staff roles jo UI se banaye ja sakte hain. SUPER_ADMIN jaan boojh kar shamil nahi.
export const STAFF_ROLES = [
  "OPERATIONS_MANAGER",
  "COMPLAINTS_MANAGER",
  "COLLECTOR_SUPERVISOR",
  "REWARDS_MANAGER",
  "CONTENT_MANAGER",
  "SUPPORT_AGENT",
  "READ_ONLY_ANALYST",
];

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  OPERATIONS_MANAGER: "Operations Manager",
  COMPLAINTS_MANAGER: "Complaints Manager",
  COLLECTOR_SUPERVISOR: "Collector Supervisor",
  REWARDS_MANAGER: "Rewards Manager",
  CONTENT_MANAGER: "Content Manager",
  SUPPORT_AGENT: "Support Agent",
  READ_ONLY_ANALYST: "Read-only Analyst",
  COLLECTOR: "Collector",
  RESIDENT: "Resident",
};

// /admin/users par yeh do roles nazar aate hain.
export const MANAGEABLE_ROLES = ["RESIDENT", "COLLECTOR"];

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"];

export const USER_STATUS_LABELS = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  PENDING: "Pending",
};
`);

write("actions/adminUsers.js", `
"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { verifyCurrentPassword } from "@/lib/security/stepUp";
import { ADMIN_ROLES, hasPermission } from "@/lib/permissions/roles";
import { STAFF_ROLES } from "@/lib/userAdmin";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Invalid account");

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/admin-staff");
  revalidatePath("/admin/collectors");
}

function stepUpError(check) {
  return check.reason === "LIMITED"
    ? "Too many attempts. Please try again in 15 minutes."
    : "Your password is incorrect.";
}

const reasonField = z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300);
const passwordField = z.string().min(1, "Please enter your own password to confirm").max(200);

const suspendSchema = z.object({
  userId: objectId,
  reason: reasonField,
  adminPassword: passwordField,
});

export async function suspendUserAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("users.suspend");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.userId === admin.id) return { error: "You cannot suspend your own account." };

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role isRootAdmin");
    if (!target) return { error: "Account not found." };
    if (target.isRootAdmin || target.role === "SUPER_ADMIN") {
      return { error: "Super Admin accounts cannot be suspended here." };
    }
    if (ADMIN_ROLES.includes(target.role) && !hasPermission(admin.role, "admins.manage")) {
      return { error: "You do not have permission to suspend staff accounts." };
    }

    // Filter mein hifazat dobara: root/super admin kabhi match nahi honge.
    const updated = await User.findOneAndUpdate(
      {
        _id: d.userId,
        deletedAt: null,
        status: "ACTIVE",
        isRootAdmin: { $ne: true },
        role: { $ne: "SUPER_ADMIN" },
      },
      {
        $set: { status: "SUSPENDED", suspensionReason: d.reason },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account cannot be suspended. It may already be suspended." };

    await writeAudit({
      actor: admin.id,
      action: "user.suspend",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
    });
  } catch (err) {
    console.error("Suspend user failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Account suspended. Their sessions were ended." };
}

export async function reactivateUserAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("users.suspend");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role");
    if (!target) return { error: "Account not found." };
    if (ADMIN_ROLES.includes(target.role) && !hasPermission(admin.role, "admins.manage")) {
      return { error: "You do not have permission to reactivate staff accounts." };
    }

    const updated = await User.findOneAndUpdate(
      { _id: d.userId, deletedAt: null, status: "SUSPENDED" },
      {
        $set: { status: "ACTIVE" },
        $unset: { suspensionReason: "" },
        $inc: { sessionVersion: 1 },
      },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account is not suspended." };

    await writeAudit({
      actor: admin.id,
      action: "user.reactivate",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
    });
  } catch (err) {
    console.error("Reactivate user failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Account reactivated." };
}

const staffSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email"),
  role: z.enum(STAFF_ROLES, { message: "Please choose a role" }),
  password: z.string().min(12, "Temporary password must be at least 12 characters").max(72),
  adminPassword: passwordField,
});

export async function createStaffAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("admins.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = staffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    password: formData.get("password"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const passwordHash = await bcrypt.hash(d.password, 12);
    const created = await User.create({
      name: d.name,
      email: d.email,
      passwordHash,
      role: d.role,
    });

    await writeAudit({
      actor: admin.id,
      action: "staff.create",
      targetType: "User",
      targetId: created._id.toString(),
      metadata: { role: d.role },
    });
  } catch (err) {
    if (err && err.code === 11000) return { error: "An account with this email may already exist." };
    console.error("Create staff failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Staff account created. Share the temporary password with them securely." };
}

const roleSchema = z.object({
  userId: objectId,
  role: z.enum(STAFF_ROLES, { message: "Please choose a role" }),
  reason: reasonField,
  adminPassword: passwordField,
});

export async function changeStaffRoleAction(prevState, formData) {
  let admin;
  try {
    admin = await requireActionPermission("admins.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (d.userId === admin.id) return { error: "You cannot change your own role." };

  try {
    const check = await verifyCurrentPassword(admin.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await connectDB();
    const target = await User.findOne({ _id: d.userId, deletedAt: null }).select("role");
    if (!target) return { error: "Account not found." };
    if (!STAFF_ROLES.includes(target.role)) {
      return { error: "Only existing staff accounts (not Super Admin) can have their role changed here." };
    }
    if (target.role === d.role) return { error: "This account already has that role." };

    const updated = await User.findOneAndUpdate(
      {
        _id: d.userId,
        deletedAt: null,
        isRootAdmin: { $ne: true },
        role: target.role,
      },
      { $set: { role: d.role }, $inc: { sessionVersion: 1 } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This account was updated by someone else. Please reload and try again." };

    await writeAudit({
      actor: admin.id,
      action: "staff.role_change",
      targetType: "User",
      targetId: d.userId,
      reason: d.reason,
      metadata: { from: target.role, to: d.role },
    });
  } catch (err) {
    console.error("Change staff role failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Role changed. Their sessions were ended." };
}
`);

write("components/forms/UserForms.js", `
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
`);

write("app/admin/(panel)/users/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { MANAGEABLE_ROLES, USER_STATUSES, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/userAdmin";
import { SuspendForm, ReactivateForm } from "@/components/forms/UserForms";

export const metadata = { title: "Residents and Collectors | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, role, status, q) {
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return "/admin/users" + (qs ? "?" + qs : "");
}

export default async function AdminUsersPage({ searchParams }) {
  const admin = await requirePermission("users.read");
  const canSuspend = hasPermission(admin.role, "users.suspend");
  const sp = await searchParams;
  const role = MANAGEABLE_ROLES.includes(sp?.role) ? sp.role : null;
  const status = USER_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);
  const rawQ = typeof sp?.q === "string" ? sp.q.trim().toLowerCase() : "";
  const q = /^[a-z0-9@._+-]{1,60}$/.test(rawQ) ? rawQ : "";

  const filter = { deletedAt: null, role: role ? role : { $in: MANAGEABLE_ROLES } };
  if (status) filter.status = status;
  // Email shuru se match: regex nahi, sirf range query, is liye injection ka khatra nahi.
  if (q) filter.email = { $gte: q, $lt: q + String.fromCharCode(65535) };

  let users = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select("name email role status suspensionReason createdAt")
        .lean(),
      User.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load users failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Residents and Collectors</h1>
      <p className="mt-1 text-sm text-gray-600">
        Total: {total}. Suspending an account ends its sessions immediately. New collectors are created under Collectors.
      </p>

      <form action="/admin/users" method="get" className="mt-4 flex flex-wrap items-end gap-2">
        {role && <input type="hidden" name="role" value={role} />}
        {status && <input type="hidden" name="status" value={status} />}
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-medium">Search email (starts with)</label>
          <input id="q" name="q" type="text" defaultValue={q} maxLength={60}
            className="min-h-11 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-emerald-700 px-4 text-sm font-semibold text-emerald-900">
          Search
        </button>
      </form>

      <nav aria-label="Filters" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null, status, q)} className={"rounded-md border px-3 py-2 " + (!role ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All roles
        </Link>
        {MANAGEABLE_ROLES.map((r) => (
          <Link key={r} href={href(1, r, status, q)} className={"rounded-md border px-3 py-2 " + (role === r ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {ROLE_LABELS[r]}
          </Link>
        ))}
        <span className="px-2 py-2 text-gray-500">|</span>
        <Link href={href(1, role, null, q)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          Any status
        </Link>
        {USER_STATUSES.map((s) => (
          <Link key={s} href={href(1, role, s, q)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {USER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Accounts could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && users.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No accounts match this filter.
        </p>
      )}

      {users.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[50rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Name</th>
                <th scope="col" className="py-2 pr-4">Email</th>
                <th scope="col" className="py-2 pr-4">Role</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2 pr-4">Joined</th>
                <th scope="col" className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const id = u._id.toString();
                return (
                  <tr key={id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="py-2 pr-4">
                      {USER_STATUS_LABELS[u.status] || u.status}
                      {u.status === "SUSPENDED" && u.suspensionReason && (
                        <span className="block text-xs text-gray-600">Reason: {u.suspensionReason}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{formatDateTime(u.createdAt)}</td>
                    <td className="py-2">
                      {canSuspend && u.status === "ACTIVE" && (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-red-800">Suspend</summary>
                          <SuspendForm userId={id} />
                        </details>
                      )}
                      {canSuspend && u.status === "SUSPENDED" && (
                        <details>
                          <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                          <ReactivateForm userId={id} />
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, role, status, q)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, role, status, q)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
`);

write("app/admin/(panel)/admin-staff/page.js", `
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_ROLES } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { STAFF_ROLES, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/userAdmin";
import { StaffForm, RoleForm, SuspendForm, ReactivateForm } from "@/components/forms/UserForms";

export const metadata = { title: "Admin Staff | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const me = await requirePermission("admins.manage");

  let staff = [];
  let loadError = false;
  try {
    await connectDB();
    staff = await User.find({ role: { $in: ADMIN_ROLES }, deletedAt: null })
      .sort({ createdAt: 1 })
      .select("name email role status suspensionReason isRootAdmin createdAt")
      .lean();
  } catch (err) {
    console.error("Load staff failed:", err.message);
    loadError = true;
  }

  const roles = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Admin Staff</h1>
        <p className="mt-1 text-sm text-gray-600">
          The root Super Admin cannot be changed or suspended here, and nobody can make another Super Admin from this page.
          Changing a role or suspending an account ends that person&apos;s sessions.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Staff could not be loaded. The database may be unavailable.
          </p>
        )}

        {staff.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[50rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Email</th>
                  <th scope="col" className="py-2 pr-4">Role</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2 pr-4">Created</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const id = s._id.toString();
                  const isMe = id === me.id;
                  const protectedAccount = s.isRootAdmin || s.role === "SUPER_ADMIN";
                  const canEdit = !protectedAccount && !isMe;
                  return (
                    <tr key={id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-4 font-medium">
                        {s.name}
                        {isMe && <span className="ml-2 text-xs text-gray-600">(you)</span>}
                        {s.isRootAdmin && (
                          <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Root</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{s.email}</td>
                      <td className="py-2 pr-4">{ROLE_LABELS[s.role] || s.role}</td>
                      <td className="py-2 pr-4">
                        {USER_STATUS_LABELS[s.status] || s.status}
                        {s.status === "SUSPENDED" && s.suspensionReason && (
                          <span className="block text-xs text-gray-600">Reason: {s.suspensionReason}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(s.createdAt)}</td>
                      <td className="py-2">
                        {!canEdit && <span className="text-xs text-gray-600">Protected</span>}
                        {canEdit && (
                          <div className="space-y-2">
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Change role</summary>
                              <RoleForm userId={id} roles={roles} current={s.role} />
                            </details>
                            {s.status === "ACTIVE" && (
                              <details>
                                <summary className="cursor-pointer text-sm font-semibold text-red-800">Suspend</summary>
                                <SuspendForm userId={id} />
                              </details>
                            )}
                            {s.status === "SUSPENDED" && (
                              <details>
                                <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reactivate</summary>
                                <ReactivateForm userId={id} />
                              </details>
                            )}
                          </div>
                        )}
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
        <h2 className="mb-1 text-lg font-semibold">Create a staff account</h2>
        <p className="mb-4 text-sm text-gray-600">
          No email is sent. Give the temporary password to the person yourself; they can change it under My Security.
        </p>
        <StaffForm roles={roles} />
      </section>
    </div>
  );
}
`);

// ---- Check 3: likhne ke baad har file wapas parh kar dekhna ----
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  if (!src.trim()) {
    console.log(" FAIL (khali): " + f);
    failed++;
  } else if (src.includes("PlaceholderPage")) {
    console.log(" FAIL (purana placeholder): " + f);
    failed++;
  } else if (f.startsWith("actions/") && !src.startsWith('"use server"')) {
    console.log(" FAIL (use server nahi): " + f);
    failed++;
  } else if (f.startsWith("components/forms/") && !src.startsWith('"use client"')) {
    console.log(" FAIL (use client nahi): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nNAKAAM: " + failed + " file(s) theek nahi likhi gayin.");
  process.exit(1);
}
console.log("\nSAB THEEK: " + written.length + " files likhi aur check hui.");