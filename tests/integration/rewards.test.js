import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  connectTestDb,
  clearDb,
  disconnectTestDb,
  makeUser,
  makeProduct,
  giveBalance,
  balanceOf,
  ledgerSum,
  fulfilled,
} from "./helpers.js";
import { redeemReward, transitionOrder } from "@/services/rewards";
import RewardProduct from "@/models/RewardProduct";
import RewardOrder from "@/models/RewardOrder";
import InventoryMovement from "@/models/InventoryMovement";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

function redeem(user, product, key) {
  return redeemReward({
    userId: String(user._id),
    productId: String(product._id),
    idempotencyKey: key || randomUUID(),
  });
}

function move(orderNumber, newStatus, admin, extra) {
  return transitionOrder(
    Object.assign({ orderNumber, newStatus, actorId: String(admin._id), reason: "Staff decision for this order" }, extra || {})
  );
}

async function stock(product) {
  return RewardProduct.findById(product._id).lean();
}

describe("redeemReward", () => {
  it("reserves stock, deducts points and creates a pending order", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 10);
    const product = await makeProduct();

    const result = await redeem(user, product);
    expect(result.duplicate).toBe(false);

    const p = await stock(product);
    expect(p.stockAvailable).toBe(0);
    expect(p.stockReserved).toBe(1);
    expect(await balanceOf(user._id)).toBe(0);

    const order = await RewardOrder.findOne({ orderNumber: result.orderNumber }).lean();
    expect(order.status).toBe("PENDING");
    expect(order.pointsCost).toBe(10);
    expect(await InventoryMovement.countDocuments({ product: product._id, type: "RESERVE" })).toBe(1);
  });

  it("changes nothing when the balance is too low", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 5);
    const product = await makeProduct();

    await expect(redeem(user, product)).rejects.toThrow(/not have enough/i);

    const p = await stock(product);
    expect(p.stockAvailable).toBe(1);
    expect(p.stockReserved).toBe(0);
    expect(await balanceOf(user._id)).toBe(5);
    expect(await RewardOrder.countDocuments({})).toBe(0);
    expect(await GreenPointsTransaction.countDocuments({})).toBe(0);
  });

  it("refuses an out-of-stock product", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 10);
    const product = await makeProduct({ stockAvailable: 0 });
    await expect(redeem(user, product)).rejects.toThrow(/out of stock/i);
    expect(await balanceOf(user._id)).toBe(10);
  });

  it("refuses a product that is not published", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 10);
    const product = await makeProduct({ status: "DRAFT" });
    await expect(redeem(user, product)).rejects.toThrow(/not available/i);
    expect(await balanceOf(user._id)).toBe(10);
  });

  it("does not create a second order for the same idempotency key", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 20);
    const product = await makeProduct({ stockAvailable: 5 });
    const key = randomUUID();

    const first = await redeem(user, product, key);
    const second = await redeem(user, product, key);
    expect(second.duplicate).toBe(true);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(await RewardOrder.countDocuments({ user: user._id })).toBe(1);
    expect(await balanceOf(user._id)).toBe(10);
  });

  it("creates one order and one deduction when the same key arrives many times at once", async () => {
    const user = await makeUser();
    await giveBalance(user._id, 20);
    const product = await makeProduct({ stockAvailable: 5 });
    const key = randomUUID();

    await Promise.allSettled(Array.from({ length: 5 }, () => redeem(user, product, key)));

    expect(await RewardOrder.countDocuments({ user: user._id })).toBe(1);
    expect(await balanceOf(user._id)).toBe(10);
    const p = await stock(product);
    expect(p.stockAvailable).toBe(4);
    expect(p.stockReserved).toBe(1);
  });

  it("never sells more than the stock when several residents redeem at once", async () => {
    const product = await makeProduct({ stockAvailable: 1 });
    const users = [];
    for (let i = 0; i < 5; i++) {
      const u = await makeUser();
      await giveBalance(u._id, 10);
      users.push(u);
    }

    const results = await Promise.allSettled(users.map((u) => redeem(u, product)));
    expect(fulfilled(results)).toHaveLength(1);

    const p = await stock(product);
    expect(p.stockAvailable).toBe(0);
    expect(p.stockReserved).toBe(1);
    expect(p.stockAvailable + p.stockReserved).toBe(1);

    let total = 0;
    for (const u of users) total += await balanceOf(u._id);
    expect(total).toBe(40);
    expect(await RewardOrder.countDocuments({})).toBe(1);
  });
});

describe("rejecting and cancelling", () => {
  async function pendingOrder(options) {
    const opts = options || {};
    const user = await makeUser();
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    await giveBalance(user._id, 10);
    const product = await makeProduct(opts.product);
    const result = await redeem(user, product);
    return { user, admin, product, orderNumber: result.orderNumber };
  }

  it("returns the stock and refunds the points when staff reject an order", async () => {
    const o = await pendingOrder();
    await move(o.orderNumber, "REJECTED", o.admin);

    const p = await stock(o.product);
    expect(p.stockAvailable).toBe(1);
    expect(p.stockReserved).toBe(0);
    expect(await balanceOf(o.user._id)).toBe(10);
    expect(await GreenPointsTransaction.countDocuments({ user: o.user._id, type: "REFUND" })).toBe(1);
    expect(await ledgerSum(o.user._id)).toBe(0);
    const order = await RewardOrder.findOne({ orderNumber: o.orderNumber }).lean();
    expect(order.status).toBe("REJECTED");
  });

  it("does not refund twice if the order is rejected again", async () => {
    const o = await pendingOrder();
    await move(o.orderNumber, "REJECTED", o.admin);
    await expect(move(o.orderNumber, "REJECTED", o.admin)).rejects.toThrow(/cannot be moved/i);
    expect(await balanceOf(o.user._id)).toBe(10);
  });

  it("refunds only once when two rejections arrive at the same time", async () => {
    const o = await pendingOrder();
    const results = await Promise.allSettled([
      move(o.orderNumber, "REJECTED", o.admin),
      move(o.orderNumber, "REJECTED", o.admin),
    ]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(await balanceOf(o.user._id)).toBe(10);
    const p = await stock(o.product);
    expect(p.stockAvailable).toBe(1);
    expect(p.stockReserved).toBe(0);
  });

  it("lets a resident cancel their own pending order", async () => {
    const o = await pendingOrder();
    await move(o.orderNumber, "CANCELLED", o.user, { ownerId: String(o.user._id) });
    expect(await balanceOf(o.user._id)).toBe(10);
    const order = await RewardOrder.findOne({ orderNumber: o.orderNumber }).lean();
    expect(order.status).toBe("CANCELLED");
  });

  it("does not let another resident cancel the order", async () => {
    const o = await pendingOrder();
    const other = await makeUser();
    await expect(
      move(o.orderNumber, "CANCELLED", other, { ownerId: String(other._id) })
    ).rejects.toThrow(/not found/i);
    const order = await RewardOrder.findOne({ orderNumber: o.orderNumber }).lean();
    expect(order.status).toBe("PENDING");
    expect(await balanceOf(o.user._id)).toBe(0);
  });

  it("does not let a resident cancel an order that staff already approved", async () => {
    const o = await pendingOrder();
    await move(o.orderNumber, "APPROVED", o.admin);
    await expect(
      move(o.orderNumber, "CANCELLED", o.user, { ownerId: String(o.user._id) })
    ).rejects.toThrow(/still pending/i);
    expect(await balanceOf(o.user._id)).toBe(0);
  });
});

describe("fulfilment", () => {
  it("completes a pickup order and consumes the reserved unit", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    await giveBalance(user._id, 10);
    const product = await makeProduct({ fulfillment: "PICKUP" });
    const { orderNumber } = await redeem(user, product);

    for (const s of ["APPROVED", "PREPARING", "READY_FOR_COLLECTION", "COMPLETED"]) {
      await move(orderNumber, s, admin);
    }

    const p = await stock(product);
    expect(p.stockAvailable).toBe(0);
    expect(p.stockReserved).toBe(0);
    expect(await InventoryMovement.countDocuments({ product: product._id, type: "FULFILL" })).toBe(1);
    expect(await balanceOf(user._id)).toBe(0);
    await expect(move(orderNumber, "CANCELLED", admin)).rejects.toThrow(/cannot be moved/i);
  });

  it("cannot cancel a dispatched order", async () => {
    const user = await makeUser();
    const admin = await makeUser({ role: "SUPER_ADMIN" });
    await giveBalance(user._id, 10);
    const product = await makeProduct({ fulfillment: "DISPATCH" });
    const { orderNumber } = await redeem(user, product);

    for (const s of ["APPROVED", "PREPARING", "DISPATCHED"]) {
      await move(orderNumber, s, admin);
    }
    await expect(move(orderNumber, "CANCELLED", admin)).rejects.toThrow(/cannot be moved/i);
    const p = await stock(product);
    expect(p.stockReserved).toBe(1);
  });
});
