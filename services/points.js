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
