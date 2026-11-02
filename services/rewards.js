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
