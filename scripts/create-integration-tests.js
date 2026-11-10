const fs = require("fs");
const path = require("path");

// ---- Check 1: correct folder? ----
if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

// ---- Check 2: required files exist? ----
const required = [
  "lib/db/connect.js",
  "services/points.js",
  "services/rewards.js",
  "models/User.js",
  "models/WasteReport.js",
  "models/GreenPointsAccount.js",
  "models/GreenPointsTransaction.js",
  "models/PointsEarningRule.js",
  "models/RewardProduct.js",
  "models/RewardOrder.js",
  "models/InventoryMovement.js",
  "vitest.config.mjs",
  "node_modules/vitest",
  "node_modules/mongodb-memory-server",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first (or npm install):");
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

write("vitest.integration.config.mjs", `
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Integration tests run against a local in-memory MongoDB replica set, never against Atlas.
export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.js"],
    globalSetup: ["./tests/integration/globalSetup.js"],
    testTimeout: 60000,
    hookTimeout: 300000,
    fileParallelism: false,
  },
});
`);

write("tests/integration/globalSetup.js", `
import { MongoMemoryReplSet } from "mongodb-memory-server";

export default async function setup({ provide }) {
  // A replica set is required, because the points and rewards code uses transactions.
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  provide("mongoUri", replSet.getUri("ecoclean_test"));
  return async () => {
    await replSet.stop();
  };
}
`);

write("tests/integration/helpers.js", `
import { inject } from "vitest";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import User from "@/models/User";
import WasteReport from "@/models/WasteReport";
import GreenPointsAccount from "@/models/GreenPointsAccount";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardProduct from "@/models/RewardProduct";

let counter = 1;
function next() {
  return counter++;
}

export async function connectTestDb() {
  const uri = inject("mongoUri");
  const local =
    typeof uri === "string" && (uri.startsWith("mongodb://127.0.0.1") || uri.startsWith("mongodb://localhost"));
  if (!local) {
    throw new Error("Refusing to run: the test database must be a local in-memory server.");
  }
  process.env.MONGODB_URI = uri;
  await connectDB();
  // Make sure unique indexes exist before any concurrency test starts.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function clearDb() {
  const cols = Object.values(mongoose.connection.collections);
  for (const c of cols) {
    await c.deleteMany({});
  }
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
}

export function newId() {
  return new mongoose.Types.ObjectId();
}

export function makeUser(overrides) {
  const n = next();
  return User.create(
    Object.assign(
      {
        name: "Test User " + n,
        email: "user" + n + "@example.test",
        passwordHash: "not-a-real-hash",
        role: "RESIDENT",
      },
      overrides || {}
    )
  );
}

export function makeReport(reporterId, categoryId, status) {
  const n = next();
  return WasteReport.create({
    reportId: "ECR-20261101-" + n.toString(16).toUpperCase().padStart(8, "0"),
    reporter: reporterId,
    category: categoryId,
    serviceZone: newId(),
    description: "Test description text",
    address: "Test address 1",
    addressKey: "test address 1",
    status: status || "COLLECTED",
  });
}

export function makeProduct(overrides) {
  const n = next();
  return RewardProduct.create(
    Object.assign(
      {
        name: "Product " + n,
        description: "Test product description",
        category: "PLANTS",
        pointsPrice: 10,
        stockAvailable: 1,
        stockReserved: 0,
        lowStockThreshold: 0,
        fulfillment: "PICKUP",
        status: "PUBLISHED",
      },
      overrides || {}
    )
  );
}

export function giveBalance(userId, balance) {
  return GreenPointsAccount.create({ user: userId, balance: balance });
}

export async function balanceOf(userId) {
  const account = await GreenPointsAccount.findOne({ user: userId }).lean();
  return account ? account.balance : 0;
}

export async function ledgerSum(userId) {
  const txs = await GreenPointsTransaction.find({ user: userId }).lean();
  return txs.reduce((sum, t) => sum + t.points, 0);
}

export function fulfilled(results) {
  return results.filter((r) => r.status === "fulfilled");
}
`);

write("tests/integration/points.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import {
  connectTestDb,
  clearDb,
  disconnectTestDb,
  makeUser,
  makeReport,
  newId,
  balanceOf,
  ledgerSum,
  fulfilled,
} from "./helpers.js";
import { awardReportPoints, adjustPoints, reverseTransaction } from "@/services/points";
import PointsEarningRule from "@/models/PointsEarningRule";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

async function fixture(options) {
  const opts = options || {};
  const resident = await makeUser();
  const admin = await makeUser({ role: "SUPER_ADMIN" });
  const category = newId();
  if (opts.rule !== false) {
    await PointsEarningRule.create({ category, points: 10, active: true });
  }
  const report = await makeReport(resident._id, category, opts.status);
  return { resident, admin, report, adminId: String(admin._id) };
}

function award(f) {
  return awardReportPoints({
    reportId: f.report.reportId,
    adminId: f.adminId,
    reason: "Verified collection and segregation",
  });
}

function adjust(f, points, key) {
  return adjustPoints({
    email: f.resident.email,
    points,
    reason: "Test adjustment for the ledger",
    adminId: f.adminId,
    idempotencyKey: key,
  });
}

describe("awardReportPoints", () => {
  it("awards the configured points once and records a ledger entry", async () => {
    const f = await fixture();
    const result = await award(f);
    expect(result.points).toBe(10);
    expect(await balanceOf(f.resident._id)).toBe(10);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id })).toBe(1);
  });

  it("rejects a second award for the same report", async () => {
    const f = await fixture();
    await award(f);
    await expect(award(f)).rejects.toThrow(/already awarded/i);
    expect(await balanceOf(f.resident._id)).toBe(10);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id })).toBe(1);
  });

  it("awards only once when many requests arrive at the same time", async () => {
    const f = await fixture();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => award(f)));
    expect(fulfilled(results)).toHaveLength(1);
    expect(await balanceOf(f.resident._id)).toBe(10);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id })).toBe(1);
  });

  it("does not award points for a report that is not collected", async () => {
    const f = await fixture({ status: "VERIFIED" });
    await expect(award(f)).rejects.toThrow(/Collected/);
    expect(await balanceOf(f.resident._id)).toBe(0);
  });

  it("does not award points when there is no active earning rule", async () => {
    const f = await fixture({ rule: false });
    await expect(award(f)).rejects.toThrow(/earning rule/i);
    expect(await balanceOf(f.resident._id)).toBe(0);
  });
});

describe("adjustPoints", () => {
  it("refuses a deduction larger than the balance and changes nothing", async () => {
    const f = await fixture();
    await expect(adjust(f, -5, "k-low")).rejects.toThrow(/too low/i);
    expect(await balanceOf(f.resident._id)).toBe(0);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id })).toBe(0);
  });

  it("allows a deduction that the balance can cover", async () => {
    const f = await fixture();
    await adjust(f, 5, "k-plus");
    await adjust(f, -3, "k-minus");
    expect(await balanceOf(f.resident._id)).toBe(2);
    expect(await ledgerSum(f.resident._id)).toBe(2);
  });

  it("does not record the same adjustment twice", async () => {
    const f = await fixture();
    await adjust(f, 5, "k-same");
    await expect(adjust(f, 5, "k-same")).rejects.toThrow(/already recorded/i);
    expect(await balanceOf(f.resident._id)).toBe(5);
  });
});

describe("reverseTransaction", () => {
  async function earnedTransaction(f) {
    await award(f);
    return GreenPointsTransaction.findOne({ user: f.resident._id, type: "EARN" });
  }

  it("reverses with a compensating entry and keeps the ledger consistent", async () => {
    const f = await fixture();
    const tx = await earnedTransaction(f);
    await reverseTransaction({ transactionId: tx.transactionId, adminId: f.adminId, reason: "Award was a mistake" });
    expect(await balanceOf(f.resident._id)).toBe(0);
    expect(await ledgerSum(f.resident._id)).toBe(0);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id, type: "REVERSAL" })).toBe(1);
  });

  it("refuses to reverse the same transaction twice", async () => {
    const f = await fixture();
    const tx = await earnedTransaction(f);
    const input = { transactionId: tx.transactionId, adminId: f.adminId, reason: "Award was a mistake" };
    await reverseTransaction(input);
    await expect(reverseTransaction(input)).rejects.toThrow(/already reversed/i);
    expect(await balanceOf(f.resident._id)).toBe(0);
  });

  it("reverses only once when two requests arrive at the same time", async () => {
    const f = await fixture();
    const tx = await earnedTransaction(f);
    const input = { transactionId: tx.transactionId, adminId: f.adminId, reason: "Award was a mistake" };
    const results = await Promise.allSettled([reverseTransaction(input), reverseTransaction(input)]);
    expect(fulfilled(results)).toHaveLength(1);
    expect(await balanceOf(f.resident._id)).toBe(0);
    expect(await GreenPointsTransaction.countDocuments({ user: f.resident._id, type: "REVERSAL" })).toBe(1);
  });

  it("rolls everything back when the points were already spent", async () => {
    const f = await fixture();
    const tx = await earnedTransaction(f);
    await adjust(f, -8, "k-spent");
    await expect(
      reverseTransaction({ transactionId: tx.transactionId, adminId: f.adminId, reason: "Award was a mistake" })
    ).rejects.toThrow(/too low/i);
    expect(await balanceOf(f.resident._id)).toBe(2);
    const after = await GreenPointsTransaction.findById(tx._id).lean();
    expect(after.reversedBy || null).toBeNull();
    expect(await ledgerSum(f.resident._id)).toBe(2);
  });
});
`);

write("tests/integration/rewards.test.js", `
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
`);

// ---- package.json: add "test:integration" ----
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};
const cmd = "vitest run --config vitest.integration.config.mjs";
if (pkg.scripts["test:integration"] !== cmd) {
  pkg.scripts["test:integration"] = cmd;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("Patched: package.json (npm run test:integration added)");
}

// ---- Check 3: read every file back ----
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (f.endsWith(".test.js") && !src.includes("describe(")) problems.push("no tests found");
  if (f.startsWith("tests/") && /mongodb\+srv|\.env/.test(src)) problems.push("must never reference Atlas or env files");
  if (f.endsWith("helpers.js") && !src.includes("Refusing to run")) problems.push("local-only guard is missing");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});
const checked = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (checked.scripts && checked.scripts["test:integration"] === cmd) {
  console.log(" OK: package.json (test:integration script present)");
} else {
  console.log(" FAIL: package.json is missing the test:integration script");
  failed++;
}

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked. Now run: npm run test:integration");