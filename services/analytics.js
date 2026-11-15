import mongoose from "mongoose";
import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardOrder from "@/models/RewardOrder";

const HOUR_MS = 60 * 60 * 1000;

function dateMatch(range) {
  return { createdAt: { $gte: range.from, $lt: range.toExclusive } };
}

function zoneMatch(zoneId) {
  return zoneId ? { serviceZone: new mongoose.Types.ObjectId(zoneId) } : {};
}

function reportMatch(range, zoneId) {
  return Object.assign({ deletedAt: null }, dateMatch(range), zoneMatch(zoneId));
}

function complaintMatch(range, zoneId) {
  return Object.assign({ deletedAt: null }, dateMatch(range), zoneMatch(zoneId));
}

async function countByStatus(Model, match) {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ status: r._id, count: r.count }));
}

async function reportsByDay(range, zoneId) {
  const rows = await WasteReport.aggregate([
    { $match: reportMatch(range, zoneId) },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ day: r._id, count: r.count }));
}

async function pointsByType(range) {
  const rows = await GreenPointsTransaction.aggregate([
    { $match: dateMatch(range) },
    { $group: { _id: "$type", entries: { $sum: 1 }, points: { $sum: "$points" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ type: r._id, entries: r.entries, points: r.points }));
}

async function ordersByStatus(range) {
  const rows = await RewardOrder.aggregate([
    { $match: dateMatch(range) },
    { $group: { _id: "$status", orders: { $sum: 1 }, points: { $sum: "$pointsCost" } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ status: r._id, orders: r.orders, points: r.points }));
}

function toHours(rows) {
  if (!rows.length || rows[0].avgMs === null || rows[0].avgMs === undefined) return null;
  return { hours: Math.round((rows[0].avgMs / HOUR_MS) * 10) / 10, count: rows[0].count };
}

// Average time from creation to the first staff decision (verified or rejected).
async function reviewHours(range, zoneId) {
  const rows = await WasteReport.aggregate([
    { $match: reportMatch(range, zoneId) },
    {
      $addFields: {
        decidedAt: {
          $min: {
            $map: {
              input: {
                $filter: {
                  input: "$statusHistory",
                  as: "h",
                  cond: { $in: ["$$h.status", ["VERIFIED", "REJECTED"]] },
                },
              },
              as: "h",
              in: "$$h.at",
            },
          },
        },
      },
    },
    { $match: { decidedAt: { $ne: null } } },
    { $group: { _id: null, avgMs: { $avg: { $subtract: ["$decidedAt", "$createdAt"] } }, count: { $sum: 1 } } },
  ]);
  return toHours(rows);
}

// Average time from creation to resolution, for resolved complaints only.
async function resolutionHours(range, zoneId) {
  const rows = await Complaint.aggregate([
    { $match: Object.assign(complaintMatch(range, zoneId), { status: "RESOLVED", resolvedAt: { $ne: null } }) },
    { $group: { _id: null, avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } }, count: { $sum: 1 } } },
  ]);
  return toHours(rows);
}

export async function loadDataset(key, range, zoneId) {
  await connectDB();
  switch (key) {
    case "reports-by-status":
      return countByStatus(WasteReport, reportMatch(range, zoneId));
    case "reports-by-day":
      return reportsByDay(range, zoneId);
    case "complaints-by-status":
      return countByStatus(Complaint, complaintMatch(range, zoneId));
    case "points-by-type":
      return pointsByType(range);
    case "orders-by-status":
      return ordersByStatus(range);
    default:
      throw new Error("Unknown dataset");
  }
}

export async function loadOverview(range, zoneId) {
  await connectDB();
  const [reportsByStatus, byDay, complaintsByStatus, points, orders, review, resolution] = await Promise.all([
    loadDataset("reports-by-status", range, zoneId),
    loadDataset("reports-by-day", range, zoneId),
    loadDataset("complaints-by-status", range, zoneId),
    loadDataset("points-by-type", range, zoneId),
    loadDataset("orders-by-status", range, zoneId),
    reviewHours(range, zoneId),
    resolutionHours(range, zoneId),
  ]);
  return {
    reportsByStatus,
    reportsByDay: byDay,
    complaintsByStatus,
    pointsByType: points,
    ordersByStatus: orders,
    reviewHours: review,
    resolutionHours: resolution,
  };
}
