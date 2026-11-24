import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardOrder from "@/models/RewardOrder";

const EMPTY = {
  reportsCollected: null,
  reportsSubmitted: null,
  activeZones: null,
  activeResidents: null,
  ordersCompleted: null,
  pointsEarned: null,
};

async function safe(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("Impact figure failed:", err.message);
    return null;
  }
}

// Counts and totals only. It never throws: a figure that cannot be read is null.
export async function getImpactFigures() {
  try {
    await connectDB();
  } catch (err) {
    console.error("Impact DB connect failed:", err.message);
    return Object.assign({}, EMPTY);
  }

  const [reportsCollected, reportsSubmitted, activeZones, activeResidents, ordersCompleted, pointsEarned] =
    await Promise.all([
      safe(() => WasteReport.countDocuments({ deletedAt: null, status: "COLLECTED" })),
      safe(() => WasteReport.countDocuments({ deletedAt: null })),
      safe(() => ServiceZone.countDocuments({ deletedAt: null, status: "ACTIVE" })),
      safe(() => User.countDocuments({ role: "RESIDENT", status: "ACTIVE", deletedAt: null })),
      safe(() => RewardOrder.countDocuments({ status: "COMPLETED" })),
      safe(async () => {
        const rows = await GreenPointsTransaction.aggregate([
          { $match: { type: "EARN" } },
          { $group: { _id: null, total: { $sum: "$points" } } },
        ]);
        return rows.length ? rows[0].total : 0;
      }),
    ]);

  return {
    reportsCollected: reportsCollected,
    reportsSubmitted: reportsSubmitted,
    activeZones: activeZones,
    activeResidents: activeResidents,
    ordersCompleted: ordersCompleted,
    pointsEarned: pointsEarned,
  };
}
