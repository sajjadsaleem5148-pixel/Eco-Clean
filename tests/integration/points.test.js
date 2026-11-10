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
