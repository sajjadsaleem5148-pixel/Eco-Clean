const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

write("lib/points/labels.js", `
export const TYPE_LABELS = {
  EARN: "Earned",
  REDEEM: "Redeemed",
  REFUND: "Refunded",
  ADJUST: "Adjustment",
  REVERSAL: "Reversal",
};

export const MAX_POINTS_PER_ENTRY = 1000;

export function formatPoints(n) {
  return (n > 0 ? "+" : "") + n;
}
`);

write("models/GreenPointsAccount.js", `
import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0 },
    lifetimeRedeemed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.GreenPointsAccount || mongoose.model("GreenPointsAccount", accountSchema);
`);

write("models/GreenPointsTransaction.js", `
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    transactionId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["EARN", "REDEEM", "REFUND", "ADJUST", "REVERSAL"], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    relatedReport: { type: mongoose.Schema.Types.ObjectId, ref: "WasteReport", index: true },
    verificationStatus: { type: String, enum: ["VERIFIED"], default: "VERIFIED" },
    reason: { type: String, required: true, maxlength: 300 },
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String, required: true, unique: true },
    reverses: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

transactionSchema.index({ createdAt: -1 });

export default mongoose.models.GreenPointsTransaction || mongoose.model("GreenPointsTransaction", transactionSchema);
`);

write("models/PointsEarningRule.js", `
import mongoose from "mongoose";

const ruleSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: "WasteCategory", required: true, unique: true },
    points: { type: Number, required: true, min: 1, max: 1000 },
    active: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.PointsEarningRule || mongoose.model("PointsEarningRule", ruleSchema);
`);

write("services/points.js", `
import crypto from "node:crypto";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteReport from "@/models/WasteReport";
import User from "@/models/User";

export class PointsError extends Error {
  constructor(message) {
    super(message);
    this.name = "PointsError";
  }
}

function makeTransactionId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return "GPT-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function ensureAccount(userId) {
  try {
    await GreenPointsAccount.updateOne(
      { user: userId },
      { $setOnInsert: { balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 } },
      { upsert: true }
    );
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
  }
}

async function inTransaction(work) {
  await connectDB();
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
}

export function describePointsError(err) {
  if (err instanceof PointsError) return err.message;
  if (err && err.code === 11000) return "This action was already recorded.";
  const msg = String((err && err.message) || "");
  if (err && (err.code === 20 || /replica set|Transaction numbers/i.test(msg))) {
    return "Database transactions are not available, so points cannot be changed safely.";
  }
  return null;
}

export async function awardReportPoints({ reportId, adminId, reason }) {
  await connectDB();
  const pre = await WasteReport.findOne({ reportId, deletedAt: null }).select("reporter").lean();
  if (!pre) throw new PointsError("Report not found.");
  await ensureAccount(pre.reporter);

  return inTransaction(async (session) => {
    const report = await WasteReport.findOne({ reportId, deletedAt: null })
      .session(session)
      .select("status reporter category");
    if (!report) throw new PointsError("Report not found.");
    if (report.status !== "COLLECTED") {
      throw new PointsError("Points can only be awarded for reports marked Collected.");
    }

    const key = "report-award:" + reportId;
    const already = await GreenPointsTransaction.exists({ idempotencyKey: key }).session(session);
    if (already) throw new PointsError("Points were already awarded for this report.");

    const rule = await PointsEarningRule.findOne({ category: report.category, active: true }).session(session);
    if (!rule) throw new PointsError("There is no active earning rule for this waste category.");

    const account = await GreenPointsAccount.findOneAndUpdate(
      { user: report.reporter },
      { $inc: { balance: rule.points, lifetimeEarned: rule.points } },
      { returnDocument: "after", session }
    );
    if (!account) throw new PointsError("Points account not found.");

    const created = await GreenPointsTransaction.create(
      [
        {
          transactionId: makeTransactionId(),
          user: report.reporter,
          type: "EARN",
          points: rule.points,
          balanceAfter: account.balance,
          relatedReport: report._id,
          verificationStatus: "VERIFIED",
          reason,
          authorizedBy: adminId,
          idempotencyKey: key,
        },
      ],
      { session }
    );
    return { transactionId: created[0].transactionId, points: rule.points };
  });
}

export async function adjustPoints({ email, points, reason, adminId, idempotencyKey }) {
  await connectDB();
  const user = await User.findOne({ email, role: "RESIDENT", status: "ACTIVE", deletedAt: null })
    .select("_id")
    .lean();
  if (!user) throw new PointsError("No active resident account has this email.");
  await ensureAccount(user._id);

  const key = "adjust:" + idempotencyKey;

  return inTransaction(async (session) => {
    const already = await GreenPointsTransaction.exists({ idempotencyKey: key }).session(session);
    if (already) throw new PointsError("This adjustment was already recorded.");

    const filter = { user: user._id };
    if (points < 0) filter.balance = { $gte: -points };

    const account = await GreenPointsAccount.findOneAndUpdate(
      filter,
      { $inc: { balance: points } },
      { returnDocument: "after", session }
    );
    if (!account) throw new PointsError("The resident's balance is too low for this deduction.");

    const created = await GreenPointsTransaction.create(
      [
        {
          transactionId: makeTransactionId(),
          user: user._id,
          type: "ADJUST",
          points,
          balanceAfter: account.balance,
          verificationStatus: "VERIFIED",
          reason,
          authorizedBy: adminId,
          idempotencyKey: key,
        },
      ],
      { session }
    );
    return { transactionId: created[0].transactionId };
  });
}

export async function reverseTransaction({ transactionId, adminId, reason }) {
  await connectDB();
  return inTransaction(async (session) => {
    const original = await GreenPointsTransaction.findOne({ transactionId }).session(session);
    if (!original) throw new PointsError("Transaction not found.");
    if (!["EARN", "ADJUST"].includes(original.type)) {
      throw new PointsError("This type of transaction cannot be reversed.");
    }
    if (original.reversedBy) throw new PointsError("This transaction was already reversed.");

    const amount = -original.points;
    const reversalId = new mongoose.Types.ObjectId();

    const marked = await GreenPointsTransaction.findOneAndUpdate(
      { _id: original._id, reversedBy: null },
      { $set: { reversedBy: reversalId } },
      { returnDocument: "after", session }
    );
    if (!marked) throw new PointsError("This transaction was already reversed.");

    const filter = { user: original.user };
    if (amount < 0) filter.balance = { $gte: -amount };
    const inc = { balance: amount };
    if (original.type === "EARN") inc.lifetimeEarned = amount;

    const account = await GreenPointsAccount.findOneAndUpdate(filter, { $inc: inc }, { returnDocument: "after", session });
    if (!account) {
      throw new PointsError("Cannot reverse: the balance is too low (the points may already be spent).");
    }

    await GreenPointsTransaction.create(
      [
        {
          _id: reversalId,
          transactionId: makeTransactionId(),
          user: original.user,
          type: "REVERSAL",
          points: amount,
          balanceAfter: account.balance,
          relatedReport: original.relatedReport,
          reverses: original._id,
          verificationStatus: "VERIFIED",
          reason,
          authorizedBy: adminId,
          idempotencyKey: "reverse:" + original.transactionId,
        },
      ],
      { session }
    );
    return { points: amount };
  });
}
`);

write("actions/points.js", `
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteCategory from "@/models/WasteCategory";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { verifyCurrentPassword } from "@/lib/security/stepUp";
import { awardReportPoints, adjustPoints, reverseTransaction, describePointsError } from "@/services/points";
import { MAX_POINTS_PER_ENTRY } from "@/lib/points/labels";

function refresh() {
  revalidatePath("/admin/green-points");
  revalidatePath("/admin/points-rules");
  revalidatePath("/dashboard/green-points");
}

function stepUpError(check) {
  return check.reason === "LIMITED"
    ? "Too many attempts. Please try again in 15 minutes."
    : "Your password is incorrect.";
}

const awardSchema = z.object({
  reportId: z.string().regex(/^ECR-\\d{8}-[A-F0-9]{8}$/, "Invalid report"),
  reason: z.string().trim().min(10, "Please write a verification note (at least 10 characters)").max(300),
  confirm: z.literal("on", { message: "Please confirm that the collection and segregation were verified" }),
});

export async function awardReportPointsAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = awardSchema.safeParse({
    reportId: formData.get("reportId"),
    reason: formData.get("reason"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { reportId, reason } = parsed.data;

  try {
    const result = await awardReportPoints({ reportId, adminId: user.id, reason });
    await writeAudit({
      actor: user.id,
      action: "points.award",
      targetType: "WasteReport",
      targetId: reportId,
      reason,
      metadata: { transactionId: result.transactionId, points: result.points },
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Award points failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Points awarded." };
}

const adjustSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter the resident's email"),
  points: z.coerce
    .number()
    .int("Use a whole number")
    .refine((n) => n !== 0, { message: "Points cannot be zero" })
    .refine((n) => Math.abs(n) <= MAX_POINTS_PER_ENTRY, {
      message: "Maximum is " + MAX_POINTS_PER_ENTRY + " points per entry",
    }),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
  adminPassword: z.string().min(1, "Please enter your own password to confirm").max(200),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Please wait a moment and try again"),
});

export async function adjustPointsAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = adjustSchema.safeParse({
    email: formData.get("email"),
    points: formData.get("points"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(user.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    const result = await adjustPoints({
      email: d.email,
      points: d.points,
      reason: d.reason,
      adminId: user.id,
      idempotencyKey: d.idempotencyKey,
    });
    await writeAudit({
      actor: user.id,
      action: "points.adjust",
      targetType: "GreenPointsTransaction",
      targetId: result.transactionId,
      reason: d.reason,
      metadata: { points: d.points },
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Adjust points failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Adjustment recorded." };
}

const reverseSchema = z.object({
  transactionId: z.string().regex(/^GPT-\\d{8}-[A-F0-9]{8}$/, "Invalid transaction"),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
  adminPassword: z.string().min(1, "Please enter your own password to confirm").max(200),
});

export async function reverseTransactionAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = reverseSchema.safeParse({
    transactionId: formData.get("transactionId"),
    reason: formData.get("reason"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const check = await verifyCurrentPassword(user.id, d.adminPassword);
    if (!check.ok) return { error: stepUpError(check) };

    await reverseTransaction({ transactionId: d.transactionId, adminId: user.id, reason: d.reason });
    await writeAudit({
      actor: user.id,
      action: "points.reverse",
      targetType: "GreenPointsTransaction",
      targetId: d.transactionId,
      reason: d.reason,
    });
  } catch (err) {
    const message = describePointsError(err);
    if (message) return { error: message };
    console.error("Reverse transaction failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Transaction reversed." };
}

const ruleSchema = z.object({
  category: z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a category"),
  points: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "Minimum is 1 point")
    .max(MAX_POINTS_PER_ENTRY, "Maximum is " + MAX_POINTS_PER_ENTRY + " points"),
});

export async function saveRuleAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("points.adjust");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = ruleSchema.safeParse({
    category: formData.get("category"),
    points: formData.get("points"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const active = formData.get("active") === "on";

  try {
    await connectDB();
    const category = await WasteCategory.findById(parsed.data.category).select("_id").lean();
    if (!category) return { error: "The selected category is not available." };

    await PointsEarningRule.findOneAndUpdate(
      { category: category._id },
      { $set: { points: parsed.data.points, active, updatedBy: user.id } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    await writeAudit({
      actor: user.id,
      action: "points.rule.save",
      targetType: "PointsEarningRule",
      targetId: parsed.data.category,
      metadata: { points: parsed.data.points, active },
    });
  } catch (err) {
    console.error("Save rule failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refresh();
  return { success: "Rule saved." };
}
`);

write("components/forms/PointsForms.js", `
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
`);

write("app/admin/(panel)/points-rules/page.js", `
import connectDB from "@/lib/db/connect";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteCategory from "@/models/WasteCategory";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { RuleForm } from "@/components/forms/PointsForms";

export const metadata = { title: "Points Earning Rules | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function PointsRulesPage() {
  const user = await requirePermission("points.read");
  const canEdit = hasPermission(user.role, "points.adjust");

  let rules = [];
  let categories = [];
  let loadError = false;
  try {
    await connectDB();
    const [r, c] = await Promise.all([
      PointsEarningRule.find({}).populate("category", "name").lean(),
      WasteCategory.find({ status: "ACTIVE" }).sort({ sortOrder: 1 }).lean(),
    ]);
    rules = r;
    categories = c.map((x) => ({ id: x._id.toString(), name: x.name }));
  } catch (err) {
    console.error("Load rules failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Points Earning Rules</h1>
        <p className="mt-1 text-sm text-gray-600">
          Points are awarded only for verified, collected reports. Without an active rule for a category, no points can be awarded.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Rules could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && rules.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No earning rules yet. No points can be awarded until one is created.
          </p>
        )}
        {rules.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-medium">{r.category ? r.category.name : "-"}</td>
                    <td className="py-2 pr-4">{r.points}</td>
                    <td className="py-2">{r.active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Create or update a rule</h2>
          {categories.length === 0 ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              No waste categories are available.
            </p>
          ) : (
            <RuleForm categories={categories} />
          )}
        </section>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          Your role can view rules but cannot change them.
        </p>
      )}
    </div>
  );
}
`);

write("app/admin/(panel)/green-points/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import PointsEarningRule from "@/models/PointsEarningRule";
import WasteReport from "@/models/WasteReport";
import "@/models/WasteCategory";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";
import { AwardForm, AdjustForm, ReverseForm } from "@/components/forms/PointsForms";

export const metadata = { title: "Green Points | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminGreenPointsPage({ searchParams }) {
  const user = await requirePermission("points.read");
  const canAdjust = hasPermission(user.role, "points.adjust");
  const canSeeUser = hasPermission(user.role, "users.read");
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  let txs = [];
  let total = 0;
  let pending = [];
  let loadError = false;
  try {
    await connectDB();
    [txs, total] = await Promise.all([
      GreenPointsTransaction.find({})
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name email")
        .lean(),
      GreenPointsTransaction.countDocuments({}),
    ]);

    if (canAdjust) {
      const collected = await WasteReport.find({ status: "COLLECTED", deletedAt: null })
        .sort({ updatedAt: -1 })
        .limit(50)
        .populate("category", "name")
        .select("reportId category updatedAt")
        .lean();
      const keys = collected.map((r) => "report-award:" + r.reportId);
      const done = await GreenPointsTransaction.find({ idempotencyKey: { $in: keys } })
        .select("idempotencyKey")
        .lean();
      const doneSet = new Set(done.map((d) => d.idempotencyKey));
      const rules = await PointsEarningRule.find({ active: true }).lean();
      const ruleMap = new Map(rules.map((r) => [r.category.toString(), r.points]));

      pending = collected
        .filter((r) => !doneSet.has("report-award:" + r.reportId))
        .slice(0, 20)
        .map((r) => ({
          reportId: r.reportId,
          categoryName: r.category ? r.category.name : "-",
          points: r.category ? ruleMap.get(r.category._id.toString()) : undefined,
        }));
    }
  } catch (err) {
    console.error("Load green points failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {loadError && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Green Points data could not be loaded. The database may be unavailable.
        </p>
      )}

      {canAdjust && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>
          <h2 className="mt-4 text-lg font-semibold">Collected reports awaiting points</h2>
          <p className="mt-1 text-sm text-gray-600">
            Segregation inspections are not recorded yet, so you confirm verification manually.
          </p>
          {pending.length === 0 ? (
            <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              No collected reports are waiting for points.
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {pending.map((p) => (
                <li key={p.reportId} className="rounded-md border border-gray-200 p-4">
                  <p className="text-sm font-semibold">
                    <Link href={"/admin/reports/" + p.reportId} className="text-emerald-800 underline">{p.reportId}</Link>
                    {" "}| {p.categoryName}
                  </p>
                  {p.points ? (
                    <div className="mt-3">
                      <AwardForm reportId={p.reportId} points={p.points} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-amber-900">
                      No active earning rule for this category.{" "}
                      <Link href="/admin/points-rules" className="font-semibold underline">Create a rule</Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canAdjust && (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Manual adjustment</h2>
          <AdjustForm />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        {!canAdjust && <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>}
        <h2 className="text-lg font-semibold">Transactions</h2>
        <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

        {!loadError && txs.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No transactions yet.
          </p>
        )}

        {txs.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Transaction</th>
                  <th scope="col" className="py-2 pr-4">Resident</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2 pr-4">Balance after</th>
                  <th scope="col" className="py-2 pr-4">Reason</th>
                  <th scope="col" className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4">{t.transactionId}</td>
                    <td className="py-2 pr-4">
                      {t.user ? t.user.name : "-"}
                      {canSeeUser && t.user ? " (" + t.user.email + ")" : ""}
                    </td>
                    <td className="py-2 pr-4">
                      {TYPE_LABELS[t.type] || t.type}
                      {t.reversedBy ? " (reversed)" : ""}
                    </td>
                    <td className="py-2 pr-4 font-semibold">{formatPoints(t.points)}</td>
                    <td className="py-2 pr-4">{t.balanceAfter}</td>
                    <td className="py-2 pr-4">
                      {t.reason}
                      {canAdjust && ["EARN", "ADJUST"].includes(t.type) && !t.reversedBy && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Reverse</summary>
                          <ReverseForm transactionId={t.transactionId} />
                        </details>
                      )}
                    </td>
                    <td className="py-2">{formatDateTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={"/admin/green-points?page=" + (page - 1)} className="font-semibold text-emerald-800 underline">Previous</Link>
            ) : <span />}
            <span>Page {page} of {pages}</span>
            {page < pages ? (
              <Link href={"/admin/green-points?page=" + (page + 1)} className="font-semibold text-emerald-800 underline">Next</Link>
            ) : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
`);

write("app/dashboard/green-points/page.js", `
import connectDB from "@/lib/db/connect";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { TYPE_LABELS, formatPoints } from "@/lib/points/labels";

export const metadata = { title: "Green Points | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentGreenPointsPage() {
  const user = await requireRole(["RESIDENT"]);

  let account = null;
  let txs = [];
  let loadError = false;
  try {
    await connectDB();
    account = await GreenPointsAccount.findOne({ user: user.id }).lean();
    txs = await GreenPointsTransaction.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("transactionId type points balanceAfter reason createdAt")
      .lean();
  } catch (err) {
    console.error("Load points failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Green Points</h1>
        {loadError ? (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Your points could not be loaded. Please try again later.
          </p>
        ) : (
          <>
            <p className="mt-3 text-4xl font-bold text-emerald-900">{account ? account.balance : 0}</p>
            <p className="text-sm text-gray-600">Current balance</p>
            <p className="mt-3 text-sm text-gray-700">
              Points are awarded only after staff verify a collection. Submitting a report or photo alone never earns points.
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">History</h2>
        {!loadError && txs.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            You have no points activity yet.
          </p>
        )}
        {txs.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Points</th>
                  <th scope="col" className="py-2 pr-4">Balance</th>
                  <th scope="col" className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{formatDateTime(t.createdAt)}</td>
                    <td className="py-2 pr-4">{TYPE_LABELS[t.type] || t.type}</td>
                    <td className="py-2 pr-4 font-semibold">{formatPoints(t.points)}</td>
                    <td className="py-2 pr-4">{t.balanceAfter}</td>
                    <td className="py-2">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
`);

console.log("\nSab points files ban gayin.");