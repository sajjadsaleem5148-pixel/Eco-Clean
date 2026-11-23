import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";
import "@/models/User";
import { OVERDUE_STATUSES, overdueInfo } from "@/lib/overdue";

const MAX_OPEN_REPORTS = 500;

// Read-only. It never selects the resident, so no personal data of the reporter can reach the page.
export async function listOverdue(now) {
  await connectDB();
  const current = now || new Date();
  const reports = await WasteReport.find({ deletedAt: null, status: { $in: OVERDUE_STATUSES } })
    .sort({ createdAt: 1 })
    .limit(MAX_OPEN_REPORTS)
    .populate("serviceZone", "name targetCollectionEveryDays")
    .populate("assignedCollector", "name")
    .select("reportId status serviceZone assignedCollector statusHistory")
    .lean();

  const items = [];
  reports.forEach((r) => {
    const zoneDays = r.serviceZone ? r.serviceZone.targetCollectionEveryDays : null;
    const info = overdueInfo(r, zoneDays, current);
    if (!info) return;
    items.push({
      reportId: r.reportId,
      status: r.status,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      collectorName: r.assignedCollector ? r.assignedCollector.name : "",
      verifiedAt: info.verifiedAt,
      dueAt: info.dueAt,
      hoursLate: info.hoursLate,
    });
  });
  items.sort((a, b) => b.hoursLate - a.hoursLate);
  return items;
}

export async function listUnable(limit) {
  await connectDB();
  const reports = await WasteReport.find({ deletedAt: null, status: "UNABLE_TO_COLLECT" })
    .sort({ updatedAt: -1 })
    .limit(limit || 50)
    .populate("serviceZone", "name")
    .populate("assignedCollector", "name")
    .select("reportId serviceZone assignedCollector statusHistory")
    .lean();

  return reports.map((r) => {
    const history = Array.isArray(r.statusHistory) ? r.statusHistory : [];
    const entry = history.slice().reverse().find((h) => h.status === "UNABLE_TO_COLLECT");
    return {
      reportId: r.reportId,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      collectorName: r.assignedCollector ? r.assignedCollector.name : "",
      recordedAt: entry ? entry.at : null,
      note: entry && entry.note ? entry.note : "",
    };
  });
}
