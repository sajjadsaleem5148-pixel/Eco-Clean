import connectDB from "@/lib/db/connect";
import ServiceZone from "@/models/ServiceZone";
import User from "@/models/User";
import WasteReport from "@/models/WasteReport";
import Neighborhood from "@/models/Neighborhood";
import CollectionSchedule from "@/models/CollectionSchedule";
import { CLOSED_STATUSES } from "@/lib/reportStatus";
import { toCountMap, buildCoverageRows } from "@/lib/zoneCoverage";

function countBy(Model, match) {
  return Model.aggregate([{ $match: match }, { $group: { _id: "$serviceZone", count: { $sum: 1 } } }]);
}

// Counts only. No name, email or id of any person is ever selected or returned.
export async function getZoneCoverage() {
  await connectDB();
  const [zones, residents, neighborhoods, collectors, schedules, openReports] = await Promise.all([
    ServiceZone.find({ deletedAt: null }).select("name status").lean(),
    countBy(User, { role: "RESIDENT", status: "ACTIVE", deletedAt: null }),
    countBy(Neighborhood, { status: "ACTIVE", deletedAt: null }),
    countBy(User, { role: "COLLECTOR", status: "ACTIVE", deletedAt: null }),
    countBy(CollectionSchedule, { status: "CONFIRMED" }),
    countBy(WasteReport, { deletedAt: null, status: { $nin: CLOSED_STATUSES } }),
  ]);

  const residentMap = toCountMap(residents);
  const totalResidents = Object.values(residentMap).reduce((sum, n) => sum + n, 0);

  return {
    rows: buildCoverageRows(zones, {
      residents: residentMap,
      neighborhoods: toCountMap(neighborhoods),
      collectors: toCountMap(collectors),
      schedules: toCountMap(schedules),
      openReports: toCountMap(openReports),
    }),
    residentsWithoutZone: residentMap.none || 0,
    totalResidents: totalResidents,
  };
}
