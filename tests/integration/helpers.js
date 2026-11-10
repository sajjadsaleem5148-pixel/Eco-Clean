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
