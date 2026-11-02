const fs = require("fs");
const path = require("path");

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("Bani:", file);
}

// ---- GreenPointsTransaction mein relatedOrder field jodna ----
const txPath = "models/GreenPointsTransaction.js";
if (!fs.existsSync(txPath)) {
  throw new Error("models/GreenPointsTransaction.js nahi mili. Pehle create-points-files.js chalayen.");
}
let txSrc = fs.readFileSync(txPath, "utf8");
if (!txSrc.includes("relatedOrder")) {
  const marker = "verificationStatus:";
  if (!txSrc.includes(marker)) throw new Error("GreenPointsTransaction.js mein jodne ki jagah nahi mili");
  txSrc = txSrc.replace(
    marker,
    'relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: "RewardOrder", index: true },\n    ' + marker
  );
  fs.writeFileSync(txPath, txSrc, "utf8");
  console.log("Patched:", txPath);
}

write("lib/rewardStatus.js", `
export const PRODUCT_CATEGORIES = {
  PLANTS: "Plants",
  GARDENING: "Gardening supplies",
  CLEANING: "Cleaning essentials",
  SEGREGATION_KITS: "Waste-separation kits",
  RECYCLING: "Recycling supplies",
  COMPOSTING: "Composting equipment",
  COMMUNITY: "Community-improvement supplies",
};

export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export const PRODUCT_STATUS_LABELS = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

// Naya status -> kin statuses se allowed.
export const PRODUCT_STATUS_FROM = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

export const PRODUCT_TARGET_LABELS = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  ARCHIVED: "Archive",
};

export function productTargets(status) {
  return PRODUCT_STATUSES.filter((t) => PRODUCT_STATUS_FROM[t].includes(status));
}

export const FULFILLMENT_LABELS = {
  PICKUP: "Collect from a pickup point",
  DISPATCH: "Dispatched to you",
};

export const ORDER_STATUSES = [
  "PENDING", "APPROVED", "REJECTED", "PREPARING",
  "READY_FOR_COLLECTION", "DISPATCHED", "COMPLETED", "CANCELLED",
];

export const ORDER_STATUS_LABELS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PREPARING: "Preparing",
  READY_FOR_COLLECTION: "Ready for Collection",
  DISPATCHED: "Dispatched",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_TRANSITIONS = {
  PENDING: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_COLLECTION", "DISPATCHED", "CANCELLED"],
  READY_FOR_COLLECTION: ["COMPLETED", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
};

export const STAFF_ORDER_STATUSES = ORDER_STATUSES.filter((s) => s !== "PENDING");

export const REASON_REQUIRED_ORDER = ["REJECTED", "CANCELLED"];

export function nextOrderStatuses(status, fulfillment) {
  return (ORDER_TRANSITIONS[status] || []).filter(
    (s) =>
      !(s === "READY_FOR_COLLECTION" && fulfillment !== "PICKUP") &&
      !(s === "DISPATCHED" && fulfillment !== "DISPATCH")
  );
}

export const MOVEMENT_LABELS = {
  RESTOCK: "Restock",
  ADJUST: "Correction",
  RESERVE: "Reserved (order)",
  RELEASE: "Released (order cancelled)",
  FULFILL: "Fulfilled (order completed)",
};
`);

write("models/RewardProduct.js", `
import mongoose from "mongoose";
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from "@/lib/rewardStatus";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    category: { type: String, enum: Object.keys(PRODUCT_CATEGORIES), required: true, index: true },
    environmentalBenefit: { type: String, trim: true, maxlength: 300 },
    pointsPrice: { type: Number, required: true, min: 1, max: 100000 },
    stockAvailable: { type: Number, default: 0, min: 0 },
    stockReserved: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    fulfillment: { type: String, enum: ["PICKUP", "DISPATCH"], required: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: "DRAFT", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.RewardProduct || mongoose.model("RewardProduct", productSchema);
`);

write("models/InventoryMovement.js", `
import mongoose from "mongoose";

const movementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "RewardProduct", required: true, index: true },
    type: { type: String, enum: ["RESTOCK", "ADJUST", "RESERVE", "RELEASE", "FULFILL"], required: true },
    quantity: { type: Number, required: true },
    stockAfter: { type: Number, required: true },
    reservedAfter: { type: Number, required: true },
    reason: { type: String, required: true, maxlength: 300 },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "RewardOrder" },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

movementSchema.index({ createdAt: -1 });

export default mongoose.models.InventoryMovement || mongoose.model("InventoryMovement", movementSchema);
`);

write("models/RewardOrder.js", `
import mongoose from "mongoose";
import { ORDER_STATUSES } from "@/lib/rewardStatus";

const historySchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 300 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "RewardProduct", required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    pointsCost: { type: Number, required: true, min: 1 },
    fulfillment: { type: String, enum: ["PICKUP", "DISPATCH"], required: true },
    note: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", index: true },
    statusHistory: [historySchema],
    pointsTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "GreenPointsTransaction" },
    idempotencyKey: { type: String },
  },
  { timestamps: true }
);

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
orderSchema.index({ createdAt: -1 });

export default mongoose.models.RewardOrder || mongoose.model("RewardOrder", orderSchema);
`);

write("services/rewards.js", `
import crypto from "node:crypto";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import RewardOrder from "@/models/RewardOrder";
import InventoryMovement from "@/models/InventoryMovement";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import { ORDER_STATUS_LABELS, nextOrderStatuses } from "@/lib/rewardStatus";

export class RewardError extends Error {
  constructor(message) {
    super(message);
    this.name = "RewardError";
  }
}

function makeCode(prefix) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return prefix + "-" + d + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Transaction chal nahi sakti to error aata hai. Unsafe fallback kabhi nahi.
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

export function describeRewardError(err) {
  if (err instanceof RewardError) return err.message;
  if (err && err.code === 11000) return "This action was already recorded.";
  const msg = String((err && err.message) || "");
  if (err && (err.code === 20 || /replica set|Transaction numbers/i.test(msg))) {
    return "Database transactions are not available, so rewards cannot be changed safely.";
  }
  return null;
}

export async function createProduct({ data, adminId }) {
  return inTransaction(async (session) => {
    const created = await RewardProduct.create(
      [
        {
          name: data.name,
          description: data.description,
          category: data.category,
          environmentalBenefit: data.environmentalBenefit,
          pointsPrice: data.pointsPrice,
          stockAvailable: data.initialStock,
          stockReserved: 0,
          lowStockThreshold: data.lowStockThreshold,
          fulfillment: data.fulfillment,
          status: "DRAFT",
          createdBy: adminId,
        },
      ],
      { session }
    );
    const product = created[0];
    if (data.initialStock > 0) {
      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: "RESTOCK",
            quantity: data.initialStock,
            stockAfter: product.stockAvailable,
            reservedAfter: 0,
            reason: "Initial stock",
            by: adminId,
          },
        ],
        { session }
      );
    }
    return { id: product._id.toString() };
  });
}

export async function adjustStock({ productId, delta, reason, adminId }) {
  return inTransaction(async (session) => {
    const filter = { _id: productId, deletedAt: null };
    if (delta < 0) filter.stockAvailable = { $gte: -delta };

    const product = await RewardProduct.findOneAndUpdate(
      filter,
      { $inc: { stockAvailable: delta } },
      { returnDocument: "after", session }
    );
    if (!product) throw new RewardError("Product not found, or the stock is too low for this deduction.");

    await InventoryMovement.create(
      [
        {
          product: product._id,
          type: delta > 0 ? "RESTOCK" : "ADJUST",
          quantity: delta,
          stockAfter: product.stockAvailable,
          reservedAfter: product.stockReserved,
          reason,
          by: adminId,
        },
      ],
      { session }
    );
    return { stockAvailable: product.stockAvailable };
  });
}

// Stock reserve, points deduct, order, movement: sab ek transaction mein.
export async function redeemReward({ userId, productId, idempotencyKey, note }) {
  await connectDB();
  try {
    await GreenPointsAccount.updateOne(
      { user: userId },
      { $setOnInsert: { balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0 } },
      { upsert: true }
    );
  } catch (err) {
    if (!(err && err.code === 11000)) throw err;
  }

  return inTransaction(async (session) => {
    const existing = await RewardOrder.findOne({ user: userId, idempotencyKey })
      .session(session)
      .select("orderNumber");
    if (existing) return { orderNumber: existing.orderNumber, duplicate: true };

    const product = await RewardProduct.findOne({ _id: productId, status: "PUBLISHED", deletedAt: null })
      .session(session);
    if (!product) throw new RewardError("This reward is not available.");
    const cost = product.pointsPrice;

    const reserved = await RewardProduct.findOneAndUpdate(
      { _id: product._id, status: "PUBLISHED", deletedAt: null, stockAvailable: { $gte: 1 } },
      { $inc: { stockAvailable: -1, stockReserved: 1 } },
      { returnDocument: "after", session }
    );
    if (!reserved) throw new RewardError("This reward is out of stock.");

    const account = await GreenPointsAccount.findOneAndUpdate(
      { user: userId, balance: { $gte: cost } },
      { $inc: { balance: -cost, lifetimeRedeemed: cost } },
      { returnDocument: "after", session }
    );
    if (!account) throw new RewardError("You do not have enough Green Points for this reward.");

    const orderId = new mongoose.Types.ObjectId();
    const orderNumber = makeCode("ERD");

    const tx = await GreenPointsTransaction.create(
      [
        {
          transactionId: makeCode("GPT"),
          user: userId,
          type: "REDEEM",
          points: -cost,
          balanceAfter: account.balance,
          relatedOrder: orderId,
          verificationStatus: "VERIFIED",
          reason: "Redeemed: " + product.name,
          idempotencyKey: "redeem:" + orderNumber,
        },
      ],
      { session }
    );

    await RewardOrder.create(
      [
        {
          _id: orderId,
          orderNumber,
          user: userId,
          product: product._id,
          productName: product.name,
          quantity: 1,
          pointsCost: cost,
          fulfillment: product.fulfillment,
          note,
          status: "PENDING",
          statusHistory: [{ status: "PENDING", by: userId, note: "Order placed and points deducted" }],
          pointsTransaction: tx[0]._id,
          idempotencyKey,
        },
      ],
      { session }
    );

    await InventoryMovement.create(
      [
        {
          product: product._id,
          type: "RESERVE",
          quantity: -1,
          stockAfter: reserved.stockAvailable,
          reservedAfter: reserved.stockReserved,
          reason: "Reserved for order " + orderNumber,
          order: orderId,
          by: userId,
        },
      ],
      { session }
    );

    return { orderNumber, duplicate: false, cost };
  });
}

// Status badalna. Reject/Cancel par stock wapas + points refund, Complete par reserved unit consume.
export async function transitionOrder({ orderNumber, newStatus, actorId, reason, ownerId }) {
  return inTransaction(async (session) => {
    const filter = { orderNumber };
    if (ownerId) filter.user = ownerId;

    const order = await RewardOrder.findOne(filter).session(session);
    if (!order) throw new RewardError("Order not found.");

    if (ownerId && (order.status !== "PENDING" || newStatus !== "CANCELLED")) {
      throw new RewardError("You can only cancel an order that is still pending.");
    }
    if (!nextOrderStatuses(order.status, order.fulfillment).includes(newStatus)) {
      throw new RewardError("This order cannot be moved to that status.");
    }

    const note = reason || "Status changed to " + ORDER_STATUS_LABELS[newStatus];
    const updated = await RewardOrder.findOneAndUpdate(
      { _id: order._id, status: order.status },
      {
        $set: { status: newStatus },
        $push: { statusHistory: { status: newStatus, at: new Date(), by: actorId, note } },
      },
      { returnDocument: "after", session }
    );
    if (!updated) throw new RewardError("This order was updated by someone else. Please reload and try again.");

    const qty = order.quantity;

    if (newStatus === "REJECTED" || newStatus === "CANCELLED") {
      const product = await RewardProduct.findOneAndUpdate(
        { _id: order.product, stockReserved: { $gte: qty } },
        { $inc: { stockAvailable: qty, stockReserved: -qty } },
        { returnDocument: "after", session }
      );
      if (!product) throw new RewardError("Inventory records are inconsistent. Please contact an administrator.");

      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: "RELEASE",
            quantity: qty,
            stockAfter: product.stockAvailable,
            reservedAfter: product.stockReserved,
            reason: "Order " + orderNumber + " " + newStatus.toLowerCase(),
            order: order._id,
            by: actorId,
          },
        ],
        { session }
      );

      const account = await GreenPointsAccount.findOneAndUpdate(
        { user: order.user },
        { $inc: { balance: order.pointsCost, lifetimeRedeemed: -order.pointsCost } },
        { returnDocument: "after", session }
      );
      if (!account) throw new RewardError("Points account not found.");

      await GreenPointsTransaction.create(
        [
          {
            transactionId: makeCode("GPT"),
            user: order.user,
            type: "REFUND",
            points: order.pointsCost,
            balanceAfter: account.balance,
            relatedOrder: order._id,
            verificationStatus: "VERIFIED",
            reason: "Refund for " + newStatus.toLowerCase() + " order " + orderNumber,
            authorizedBy: actorId,
            idempotencyKey: "refund:" + orderNumber,
          },
        ],
        { session }
      );
    }

    if (newStatus === "COMPLETED") {
      const product = await RewardProduct.findOneAndUpdate(
        { _id: order.product, stockReserved: { $gte: qty } },
        { $inc: { stockReserved: -qty } },
        { returnDocument: "after", session }
      );
      if (!product) throw new RewardError("Inventory records are inconsistent. Please contact an administrator.");

      await InventoryMovement.create(
        [
          {
            product: product._id,
            type: "FULFILL",
            quantity: -qty,
            stockAfter: product.stockAvailable,
            reservedAfter: product.stockReserved,
            reason: "Order " + orderNumber + " completed",
            order: order._id,
            by: actorId,
          },
        ],
        { session }
      );
    }

    return { status: newStatus };
  });
}
`);

write("actions/rewards.js", `
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { getCurrentUser } from "@/lib/auth/session";
import { requireActionPermission } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit/log";
import { hit, makeKey } from "@/lib/security/rateLimit";
import {
  createProduct,
  adjustStock,
  redeemReward,
  transitionOrder,
  describeRewardError,
} from "@/services/rewards";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_FROM,
  STAFF_ORDER_STATUSES,
  REASON_REQUIRED_ORDER,
} from "@/lib/rewardStatus";

const objectId = z.string().regex(/^[a-f\\d]{24}$/i, "Please choose a valid option");
const orderRegex = /^ERD-\\d{8}-[A-F0-9]{8}$/;

function refreshAll() {
  revalidatePath("/rewards");
  revalidatePath("/dashboard/rewards");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/green-points");
  revalidatePath("/admin/rewards");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/orders");
}

const productSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  category: z.enum(Object.keys(PRODUCT_CATEGORIES), { message: "Please choose a category" }),
  environmentalBenefit: z.string().trim().max(300).optional(),
  pointsPrice: z.coerce.number().int("Use a whole number").min(1, "Minimum price is 1 point").max(100000),
  initialStock: z.coerce.number().int("Use a whole number").min(0, "Stock cannot be negative").max(100000),
  lowStockThreshold: z.coerce.number().int("Use a whole number").min(0).max(100000),
  fulfillment: z.enum(["PICKUP", "DISPATCH"], { message: "Please choose a fulfillment method" }),
});

export async function createProductAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    environmentalBenefit: formData.get("environmentalBenefit") || undefined,
    pointsPrice: formData.get("pointsPrice"),
    initialStock: formData.get("initialStock"),
    lowStockThreshold: formData.get("lowStockThreshold"),
    fulfillment: formData.get("fulfillment"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const result = await createProduct({ data: parsed.data, adminId: user.id });
    await writeAudit({
      actor: user.id,
      action: "reward.product.create",
      targetType: "RewardProduct",
      targetId: result.id,
      metadata: { name: parsed.data.name, pointsPrice: parsed.data.pointsPrice },
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Create product failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Product created as a draft. Publish it when it is ready." };
}

const statusSchema = z.object({
  productId: objectId,
  target: z.enum(PRODUCT_STATUSES, { message: "Invalid status" }),
});

export async function setProductStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = statusSchema.safeParse({
    productId: formData.get("productId"),
    target: formData.get("target"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { productId, target } = parsed.data;

  try {
    await connectDB();
    const updated = await RewardProduct.findOneAndUpdate(
      { _id: productId, deletedAt: null, status: { $in: PRODUCT_STATUS_FROM[target] } },
      { $set: { status: target } },
      { returnDocument: "after" }
    ).select("_id");
    if (!updated) return { error: "This product cannot be moved to that status." };

    await writeAudit({
      actor: user.id,
      action: "reward.product.status." + target.toLowerCase(),
      targetType: "RewardProduct",
      targetId: productId,
    });
  } catch (err) {
    console.error("Set product status failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Product updated." };
}

const stockSchema = z.object({
  productId: objectId,
  delta: z.coerce
    .number()
    .int("Use a whole number")
    .refine((n) => n !== 0, { message: "Change cannot be zero" })
    .refine((n) => Math.abs(n) <= 100000, { message: "Change is too large" }),
  reason: z.string().trim().min(10, "Please write a reason (at least 10 characters)").max(300),
});

export async function adjustStockAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("inventory.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = stockSchema.safeParse({
    productId: formData.get("productId"),
    delta: formData.get("delta"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await adjustStock({ productId: d.productId, delta: d.delta, reason: d.reason, adminId: user.id });
    await writeAudit({
      actor: user.id,
      action: "inventory.adjust",
      targetType: "RewardProduct",
      targetId: d.productId,
      reason: d.reason,
      metadata: { delta: d.delta },
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Adjust stock failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Stock updated." };
}

const redeemSchema = z.object({
  productId: objectId,
  note: z.string().trim().max(200, "Note is too long").optional(),
  idempotencyKey: z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid form. Please reload the page."),
});

export async function redeemRewardAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") {
    return { error: "Please log in with a resident account to redeem rewards." };
  }

  const parsed = redeemSchema.safeParse({
    productId: formData.get("productId"),
    note: formData.get("note") || undefined,
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const rl = await hit(makeKey("redeem", user.id), 10, 60 * 60);
    if (!rl.ok) return { error: "Too many redemption attempts. Please try again later." };

    const result = await redeemReward({
      userId: user.id,
      productId: d.productId,
      idempotencyKey: d.idempotencyKey,
      note: d.note,
    });
    if (!result.duplicate) {
      await writeAudit({
        actor: user.id,
        action: "reward.redeem",
        targetType: "RewardOrder",
        targetId: result.orderNumber,
        metadata: { points: result.cost },
      });
    }
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Redeem failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  redirect("/dashboard/orders?placed=1");
}

const cancelSchema = z.object({
  orderNumber: z.string().regex(orderRegex, "Invalid order"),
  reason: z.string().trim().min(10, "Please explain why you are cancelling (at least 10 characters)").max(300),
});

export async function cancelOwnOrderAction(prevState, formData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "RESIDENT") return { error: "You do not have permission to do this." };

  const parsed = cancelSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await transitionOrder({
      orderNumber: d.orderNumber,
      newStatus: "CANCELLED",
      actorId: user.id,
      reason: "Cancelled by resident: " + d.reason,
      ownerId: user.id,
    });
    await writeAudit({
      actor: user.id,
      action: "reward.order.cancelled",
      targetType: "RewardOrder",
      targetId: d.orderNumber,
      reason: d.reason,
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Cancel order failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  return { success: "Order cancelled. Your points were refunded." };
}

const orderStatusSchema = z.object({
  orderNumber: z.string().regex(orderRegex, "Invalid order"),
  status: z.enum(STAFF_ORDER_STATUSES, { message: "Please choose a status" }),
  reason: z.string().trim().max(300, "Text is too long (300 characters maximum)").optional(),
});

export async function updateOrderStatusAction(prevState, formData) {
  let user;
  try {
    user = await requireActionPermission("rewards.manage");
  } catch {
    return { error: "You do not have permission to do this." };
  }

  const parsed = orderStatusSchema.safeParse({
    orderNumber: formData.get("orderNumber"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { orderNumber, status, reason } = parsed.data;

  if (REASON_REQUIRED_ORDER.includes(status) && (!reason || reason.length < 10)) {
    return { error: "A reason of at least 10 characters is required for this status." };
  }

  try {
    await transitionOrder({ orderNumber, newStatus: status, actorId: user.id, reason });
    await writeAudit({
      actor: user.id,
      action: "reward.order." + status.toLowerCase(),
      targetType: "RewardOrder",
      targetId: orderNumber,
      reason: REASON_REQUIRED_ORDER.includes(status) ? reason : undefined,
    });
  } catch (err) {
    const message = describeRewardError(err);
    if (message) return { error: message };
    console.error("Update order failed:", err.message);
    return { error: "Something went wrong. Please try again." };
  }

  refreshAll();
  revalidatePath("/admin/orders/" + orderNumber);
  return { success: "Order updated." };
}
`);

write("components/forms/RewardForms.js", `
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
`);

write("app/(public)/rewards/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { PRODUCT_CATEGORIES, FULFILLMENT_LABELS } from "@/lib/rewardStatus";

export const metadata = { title: "Green Rewards | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  let products = [];
  let loadError = false;
  try {
    await connectDB();
    products = await RewardProduct.find({ status: "PUBLISHED", deletedAt: null })
      .sort({ pointsPrice: 1 })
      .select("name category pointsPrice stockAvailable fulfillment")
      .lean();
  } catch (err) {
    console.error("Load rewards failed:", err.message);
    loadError = true;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Green Rewards</h1>
      <p className="mt-2 text-sm text-gray-700">
        Redeem Green Points for eligible rewards while stock lasts. Points are earned only for verified collections.
        Fresh produce is not offered until supplier, expiry and storage controls are configured.
      </p>

      {loadError && (
        <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Rewards are temporarily unavailable. Please try again later.
        </p>
      )}
      {!loadError && products.length === 0 && (
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No rewards have been published yet.
        </p>
      )}

      {products.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-xs font-semibold text-emerald-800">{PRODUCT_CATEGORIES[p.category] || p.category}</p>
              <h2 className="mt-1 text-lg font-semibold">
                <Link href={"/rewards/" + p._id.toString()} className="text-emerald-900 underline">{p.name}</Link>
              </h2>
              <p className="mt-2 text-2xl font-bold text-emerald-900">{p.pointsPrice} points</p>
              <p className="mt-1 text-sm text-gray-700">{p.stockAvailable > 0 ? "In stock" : "Out of stock"}</p>
              <p className="text-sm text-gray-600">{FULFILLMENT_LABELS[p.fulfillment]}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`);

write("app/(public)/rewards/[id]/page.js", `
import crypto from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import { getCurrentUser } from "@/lib/auth/session";
import { PRODUCT_CATEGORIES, FULFILLMENT_LABELS } from "@/lib/rewardStatus";
import { RedeemForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Reward Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function RewardDetailPage({ params }) {
  const { id } = await params;
  if (!/^[a-f\\d]{24}$/i.test(id)) notFound();

  let product = null;
  let user = null;
  let balance = 0;
  let loadError = false;
  try {
    await connectDB();
    product = await RewardProduct.findOne({ _id: id, status: "PUBLISHED", deletedAt: null })
      .select("name description category pointsPrice stockAvailable fulfillment environmentalBenefit")
      .lean();
    user = await getCurrentUser();
    if (product && user && user.role === "RESIDENT") {
      const account = await GreenPointsAccount.findOne({ user: user.id }).lean();
      balance = account ? account.balance : 0;
    }
  } catch (err) {
    console.error("Load reward failed:", err.message);
    loadError = true;
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          This reward could not be loaded. Please try again later.
        </p>
      </main>
    );
  }
  if (!product) notFound();

  const inStock = product.stockAvailable > 0;
  const isResident = user && user.role === "RESIDENT";
  const enough = balance >= product.pointsPrice;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/rewards" className="text-sm font-semibold text-emerald-800 underline">Back to rewards</Link>
      <h1 className="mt-2 text-3xl font-bold text-emerald-900">{product.name}</h1>
      <p className="mt-1 text-sm font-semibold text-emerald-800">{PRODUCT_CATEGORIES[product.category] || product.category}</p>
      <p className="mt-4 text-sm text-gray-800">{product.description}</p>
      {product.environmentalBenefit && (
        <p className="mt-3 text-sm text-gray-700">Environmental benefit: {product.environmentalBenefit}</p>
      )}
      <p className="mt-4 text-2xl font-bold text-emerald-900">{product.pointsPrice} points</p>
      <p className="text-sm text-gray-700">{inStock ? "In stock" : "Out of stock"} | {FULFILLMENT_LABELS[product.fulfillment]}</p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        {!user && (
          <p className="text-sm">
            Please <Link href="/login" className="font-semibold text-emerald-800 underline">log in</Link> or{" "}
            <Link href="/register" className="font-semibold text-emerald-800 underline">register</Link> to redeem this reward.
          </p>
        )}
        {user && !isResident && (
          <p className="text-sm text-gray-700">Only resident accounts can redeem rewards.</p>
        )}
        {isResident && (
          <>
            <p className="mb-3 text-sm text-gray-700">Your balance: <span className="font-semibold">{balance}</span> points</p>
            {!inStock && <p className="text-sm text-amber-900">This reward is currently out of stock.</p>}
            {inStock && !enough && (
              <p className="text-sm text-amber-900">
                You need {product.pointsPrice - balance} more points to redeem this reward.
              </p>
            )}
            {inStock && enough && (
              <RedeemForm
                productId={product._id.toString()}
                price={product.pointsPrice}
                idempotencyKey={crypto.randomUUID()}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
`);

write("app/dashboard/rewards/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import { requireRole } from "@/lib/auth/guards";
import { PRODUCT_CATEGORIES } from "@/lib/rewardStatus";

export const metadata = { title: "Rewards Store | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function ResidentRewardsPage() {
  const user = await requireRole(["RESIDENT"]);

  let products = [];
  let balance = 0;
  let loadError = false;
  try {
    await connectDB();
    const [list, account] = await Promise.all([
      RewardProduct.find({ status: "PUBLISHED", deletedAt: null })
        .sort({ pointsPrice: 1 })
        .select("name category pointsPrice stockAvailable")
        .lean(),
      GreenPointsAccount.findOne({ user: user.id }).lean(),
    ]);
    products = list;
    balance = account ? account.balance : 0;
  } catch (err) {
    console.error("Load rewards store failed:", err.message);
    loadError = true;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Rewards Store</h1>
        <p className="text-sm text-gray-700">Balance: <span className="font-semibold">{balance}</span> points</p>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Rewards could not be loaded. Please try again later.
        </p>
      )}
      {!loadError && products.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No rewards have been published yet.
        </p>
      )}

      {products.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <li key={p._id.toString()} className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-semibold text-emerald-800">{PRODUCT_CATEGORIES[p.category] || p.category}</p>
              <p className="mt-1 font-semibold">
                <Link href={"/rewards/" + p._id.toString()} className="text-emerald-900 underline">{p.name}</Link>
              </p>
              <p className="mt-1 text-sm">{p.pointsPrice} points | {p.stockAvailable > 0 ? "In stock" : "Out of stock"}</p>
              <p className="text-sm text-gray-600">
                {balance >= p.pointsPrice ? "You can afford this" : "You need " + (p.pointsPrice - balance) + " more points"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
`);

write("app/dashboard/orders/page.js", `
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import { requireRole } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUS_LABELS, FULFILLMENT_LABELS } from "@/lib/rewardStatus";
import { CancelOrderForm } from "@/components/forms/RewardForms";

export const metadata = { title: "My Orders | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function MyOrdersPage({ searchParams }) {
  const user = await requireRole(["RESIDENT"]);
  const sp = await searchParams;

  let orders = [];
  let loadError = false;
  try {
    await connectDB();
    // Hamesha apne orders: user server ke session se aata hai.
    orders = await RewardOrder.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("orderNumber productName pointsCost fulfillment status statusHistory createdAt")
      .lean();
  } catch (err) {
    console.error("Load orders failed:", err.message);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
        {sp?.placed && (
          <p role="status" className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Your order was placed and the points were deducted. Staff will review it soon.
          </p>
        )}
        {loadError && (
          <p role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Orders could not be loaded. Please try again later.
          </p>
        )}
        {!loadError && orders.length === 0 && (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            You have not redeemed any rewards yet.
          </p>
        )}
      </section>

      {orders.map((o) => (
        <section key={o._id.toString()} className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{o.productName}</h2>
          <p className="text-sm text-gray-700">
            Order {o.orderNumber} | {o.pointsCost} points | {FULFILLMENT_LABELS[o.fulfillment]}
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-800">
            Status: {ORDER_STATUS_LABELS[o.status] || o.status}
          </p>
          <ol className="mt-3 space-y-2 text-sm">
            {o.statusHistory.map((h, i) => (
              <li key={i} className="border-l-4 border-emerald-700 pl-3">
                <p className="font-semibold">{ORDER_STATUS_LABELS[h.status] || h.status}</p>
                <p className="text-gray-600">{formatDateTime(h.at)}</p>
                {h.note && <p className="text-gray-700">{h.note}</p>}
              </li>
            ))}
          </ol>
          {o.status === "PENDING" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Cancel this order</summary>
              <CancelOrderForm orderNumber={o.orderNumber} />
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
`);

write("app/admin/(panel)/rewards/page.js", `
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import { requirePermission } from "@/lib/auth/guards";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS_LABELS,
  PRODUCT_TARGET_LABELS,
  FULFILLMENT_LABELS,
  productTargets,
} from "@/lib/rewardStatus";
import { ProductForm, ProductStatusButton } from "@/components/forms/RewardForms";

export const metadata = { title: "Reward Products | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  await requirePermission("rewards.manage");

  let products = [];
  let loadError = false;
  try {
    await connectDB();
    products = await RewardProduct.find({ deletedAt: null }).sort({ createdAt: -1 }).lean();
  } catch (err) {
    console.error("Load products failed:", err.message);
    loadError = true;
  }

  const categories = Object.entries(PRODUCT_CATEGORIES).map(([value, label]) => ({ value, label }));
  const fulfillments = Object.entries(FULFILLMENT_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Reward Products</h1>
        <p className="mt-1 text-sm text-gray-600">
          New products start as drafts. Only published products appear in the store. Fresh produce is not available
          until supplier, expiry and storage controls exist.
        </p>

        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Products could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && products.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No products yet. Create the first one below.
          </p>
        )}

        {products.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Name</th>
                  <th scope="col" className="py-2 pr-4">Category</th>
                  <th scope="col" className="py-2 pr-4">Price</th>
                  <th scope="col" className="py-2 pr-4">Available</th>
                  <th scope="col" className="py-2 pr-4">Reserved</th>
                  <th scope="col" className="py-2 pr-4">Status</th>
                  <th scope="col" className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">{p.name}</td>
                    <td className="py-2 pr-4">{PRODUCT_CATEGORIES[p.category] || p.category}</td>
                    <td className="py-2 pr-4">{p.pointsPrice}</td>
                    <td className="py-2 pr-4">{p.stockAvailable}</td>
                    <td className="py-2 pr-4">{p.stockReserved}</td>
                    <td className="py-2 pr-4">{PRODUCT_STATUS_LABELS[p.status] || p.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {productTargets(p.status).map((t) => (
                          <ProductStatusButton
                            key={t}
                            productId={p._id.toString()}
                            target={t}
                            label={PRODUCT_TARGET_LABELS[t]}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">Create a product</h2>
        <ProductForm categories={categories} fulfillments={fulfillments} />
      </section>
    </div>
  );
}
`);

write("app/admin/(panel)/inventory/page.js", `
import connectDB from "@/lib/db/connect";
import RewardProduct from "@/models/RewardProduct";
import InventoryMovement from "@/models/InventoryMovement";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { MOVEMENT_LABELS } from "@/lib/rewardStatus";
import { StockForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Inventory | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  await requirePermission("inventory.manage");

  let products = [];
  let movements = [];
  let loadError = false;
  try {
    await connectDB();
    [products, movements] = await Promise.all([
      RewardProduct.find({ deletedAt: null }).sort({ name: 1 }).lean(),
      InventoryMovement.find({}).sort({ createdAt: -1 }).limit(20).populate("product", "name").lean(),
    ]);
  } catch (err) {
    console.error("Load inventory failed:", err.message);
    loadError = true;
  }

  const low = products.filter((p) => p.stockAvailable <= p.lowStockThreshold);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-gray-900">Inventory and Stock</h1>
        {loadError && (
          <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            Inventory could not be loaded. The database may be unavailable.
          </p>
        )}
        {!loadError && low.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Low stock: {low.map((p) => p.name).join(", ")}
          </p>
        )}
        {!loadError && products.length === 0 && (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            No products yet. Create products under Reward Products first.
          </p>
        )}

        {products.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Product</th>
                  <th scope="col" className="py-2 pr-4">Available</th>
                  <th scope="col" className="py-2 pr-4">Reserved</th>
                  <th scope="col" className="py-2 pr-4">Threshold</th>
                  <th scope="col" className="py-2">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p._id.toString()} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-4 font-medium">
                      {p.name}
                      {p.stockAvailable <= p.lowStockThreshold && (
                        <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Low stock</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{p.stockAvailable}</td>
                    <td className="py-2 pr-4">{p.stockReserved}</td>
                    <td className="py-2 pr-4">{p.lowStockThreshold}</td>
                    <td className="py-2">
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-emerald-800">Change stock</summary>
                        <StockForm productId={p._id.toString()} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Recent stock movements</h2>
        {movements.length === 0 ? (
          <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">No movements yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-600">
                <tr>
                  <th scope="col" className="py-2 pr-4">Date</th>
                  <th scope="col" className="py-2 pr-4">Product</th>
                  <th scope="col" className="py-2 pr-4">Type</th>
                  <th scope="col" className="py-2 pr-4">Quantity</th>
                  <th scope="col" className="py-2 pr-4">Available after</th>
                  <th scope="col" className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m._id.toString()} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{formatDateTime(m.createdAt)}</td>
                    <td className="py-2 pr-4">{m.product ? m.product.name : "-"}</td>
                    <td className="py-2 pr-4">{MOVEMENT_LABELS[m.type] || m.type}</td>
                    <td className="py-2 pr-4 font-semibold">{(m.quantity > 0 ? "+" : "") + m.quantity}</td>
                    <td className="py-2 pr-4">{m.stockAfter}</td>
                    <td className="py-2">{m.reason}</td>
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

write("app/admin/(panel)/orders/page.js", `
import Link from "next/link";
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/rewardStatus";

export const metadata = { title: "Redemption Orders | ECO-CLEAN" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function href(page, status) {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return "/admin/orders" + (qs ? "?" + qs : "");
}

export default async function AdminOrdersPage({ searchParams }) {
  await requirePermission("rewards.manage");
  const sp = await searchParams;
  const status = ORDER_STATUSES.includes(sp?.status) ? sp.status : null;
  const page = Math.max(1, parseInt(sp?.page, 10) || 1);

  const filter = {};
  if (status) filter.status = status;

  let orders = [];
  let total = 0;
  let loadError = false;
  try {
    await connectDB();
    [orders, total] = await Promise.all([
      RewardOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate("user", "name")
        .select("orderNumber productName pointsCost status user createdAt")
        .lean(),
      RewardOrder.countDocuments(filter),
    ]);
  } catch (err) {
    console.error("Load orders failed:", err.message);
    loadError = true;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h1 className="text-2xl font-bold text-gray-900">Redemption Orders</h1>
      <p className="mt-1 text-sm text-gray-600">Total: {total}</p>

      <nav aria-label="Status filter" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={href(1, null)} className={"rounded-md border px-3 py-2 " + (!status ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={href(1, s)} className={"rounded-md border px-3 py-2 " + (status === s ? "border-emerald-700 bg-emerald-50 font-semibold" : "border-gray-300")}>
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Orders could not be loaded. The database may be unavailable.
        </p>
      )}
      {!loadError && orders.length === 0 && (
        <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No orders match this filter.
        </p>
      )}

      {orders.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-600">
              <tr>
                <th scope="col" className="py-2 pr-4">Order</th>
                <th scope="col" className="py-2 pr-4">Product</th>
                <th scope="col" className="py-2 pr-4">Resident</th>
                <th scope="col" className="py-2 pr-4">Points</th>
                <th scope="col" className="py-2 pr-4">Status</th>
                <th scope="col" className="py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id.toString()} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <Link href={"/admin/orders/" + o.orderNumber} className="font-semibold text-emerald-800 underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{o.productName}</td>
                  <td className="py-2 pr-4">{o.user ? o.user.name : "-"}</td>
                  <td className="py-2 pr-4">{o.pointsCost}</td>
                  <td className="py-2 pr-4">{ORDER_STATUS_LABELS[o.status] || o.status}</td>
                  <td className="py-2">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1, status)} className="font-semibold text-emerald-800 underline">Previous</Link>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={href(page + 1, status)} className="font-semibold text-emerald-800 underline">Next</Link>
          ) : <span />}
        </div>
      )}
    </section>
  );
}
`);

write("app/admin/(panel)/orders/[orderNumber]/page.js", `
import Link from "next/link";
import { notFound } from "next/navigation";
import connectDB from "@/lib/db/connect";
import RewardOrder from "@/models/RewardOrder";
import "@/models/User";
import { requirePermission } from "@/lib/auth/guards";
import { hasPermission } from "@/lib/permissions/roles";
import { formatDateTime } from "@/lib/reportStatus";
import { ORDER_STATUS_LABELS, FULFILLMENT_LABELS, nextOrderStatuses } from "@/lib/rewardStatus";
import { OrderStatusForm } from "@/components/forms/RewardForms";

export const metadata = { title: "Order Details | ECO-CLEAN" };
export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({ params }) {
  const user = await requirePermission("rewards.manage");
  const { orderNumber } = await params;
  const canSeeUser = hasPermission(user.role, "users.read");

  let order = null;
  try {
    await connectDB();
    order = await RewardOrder.findOne({ orderNumber }).populate("user", "name email").lean();
  } catch (err) {
    console.error("Load order failed:", err.message);
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        This order could not be loaded. Please try again later.
      </p>
    );
  }

  if (!order) notFound();

  const statuses = nextOrderStatuses(order.status, order.fulfillment).map((s) => ({
    value: s,
    label: ORDER_STATUS_LABELS[s],
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <Link href="/admin/orders" className="text-sm font-semibold text-emerald-800 underline">Back to orders</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Order {order.orderNumber}</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-800">
          Status: {ORDER_STATUS_LABELS[order.status] || order.status}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="font-medium text-gray-600">Product</dt><dd>{order.productName}</dd></div>
          <div><dt className="font-medium text-gray-600">Points paid</dt><dd>{order.pointsCost}</dd></div>
          <div><dt className="font-medium text-gray-600">Fulfillment</dt><dd>{FULFILLMENT_LABELS[order.fulfillment]}</dd></div>
          {canSeeUser && order.user && (
            <div><dt className="font-medium text-gray-600">Resident</dt><dd>{order.user.name} ({order.user.email})</dd></div>
          )}
          {order.note && (
            <div className="sm:col-span-2"><dt className="font-medium text-gray-600">Resident note</dt><dd>{order.note}</dd></div>
          )}
        </dl>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Update status</h2>
        {statuses.length === 0 ? (
          <p className="mt-2 text-sm text-gray-700">No further status changes are available for this order.</p>
        ) : (
          <div className="mt-3">
            <OrderStatusForm orderNumber={order.orderNumber} statuses={statuses} />
            <p className="mt-3 text-xs text-gray-600">
              Rejecting or cancelling releases the reserved stock and refunds the resident's points automatically.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Status history</h2>
        <ol className="mt-3 space-y-3 text-sm">
          {order.statusHistory.map((h, i) => (
            <li key={i} className="border-l-4 border-emerald-700 pl-3">
              <p className="font-semibold">{ORDER_STATUS_LABELS[h.status] || h.status}</p>
              <p className="text-gray-600">{formatDateTime(h.at)}</p>
              {h.note && <p className="text-gray-700">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
`);

console.log("\nSab rewards files ban gayin.");