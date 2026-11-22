import connectDB from "@/lib/db/connect";
import CollectionSchedule from "@/models/CollectionSchedule";
import ServiceZone from "@/models/ServiceZone";

function byDayThenTime(a, b) {
  return a.weekday - b.weekday || a.startTime.localeCompare(b.startTime);
}

// For residents: confirmed schedules of one active zone. The collector is never selected.
export async function confirmedForZone(zoneId) {
  await connectDB();
  const zone = await ServiceZone.findOne({ _id: zoneId, status: "ACTIVE", deletedAt: null })
    .select("name")
    .lean();
  if (!zone) return { zone: null, schedules: [] };

  const list = await CollectionSchedule.find({ serviceZone: zone._id, status: "CONFIRMED" })
    .select("weekday startTime endTime")
    .lean();

  return {
    zone: { id: zone._id.toString(), name: zone.name },
    schedules: list
      .map((s) => ({ id: s._id.toString(), weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }))
      .sort(byDayThenTime),
  };
}

// For a collector: only that collector's own confirmed schedules.
export async function confirmedForCollector(collectorId) {
  await connectDB();
  const list = await CollectionSchedule.find({ collector: collectorId, status: "CONFIRMED" })
    .populate("serviceZone", "name")
    .select("serviceZone weekday startTime endTime note")
    .lean();

  return list
    .map((s) => ({
      id: s._id.toString(),
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note || "",
      zoneName: s.serviceZone ? s.serviceZone.name : "-",
    }))
    .sort(byDayThenTime);
}
