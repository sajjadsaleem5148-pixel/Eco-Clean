import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";
import "@/models/User";
import { ACTIVE_JOB_STATUSES, summarizeByCollector, hoursSince } from "@/lib/assignmentSummary";

const MAX_ACTIVE_JOBS = 500;

// Read-only. The person who made the report is never selected, so no personal data of that person can reach the page.
export async function listActiveAssignments(options) {
  const opts = options || {};
  const now = opts.now || new Date();
  await connectDB();

  const [reports, waitingForCollector] = await Promise.all([
    WasteReport.find({
      deletedAt: null,
      status: { $in: ACTIVE_JOB_STATUSES },
      assignedCollector: { $ne: null },
    })
      .sort({ assignedAt: 1, createdAt: 1 })
      .limit(MAX_ACTIVE_JOBS)
      .populate("serviceZone", "name")
      .populate("assignedCollector", "name")
      .select("reportId status serviceZone assignedCollector assignedAt")
      .lean(),
    WasteReport.countDocuments({ deletedAt: null, status: "VERIFIED" }),
  ]);

  const all = reports.map((r) => ({
    reportId: r.reportId,
    status: r.status,
    zoneName: r.serviceZone ? r.serviceZone.name : "-",
    collectorId: r.assignedCollector ? r.assignedCollector._id.toString() : "",
    collectorName: r.assignedCollector ? r.assignedCollector.name : "Unknown collector",
    assignedAt: r.assignedAt || null,
    hoursWaiting: hoursSince(r.assignedAt, now),
  }));

  const summary = summarizeByCollector(all);
  const items = opts.collectorId ? all.filter((i) => i.collectorId === String(opts.collectorId)) : all;
  items.sort((a, b) => (b.hoursWaiting === null ? -1 : b.hoursWaiting) - (a.hoursWaiting === null ? -1 : a.hoursWaiting));

  return { items: items, summary: summary, waitingForCollector: waitingForCollector };
}
