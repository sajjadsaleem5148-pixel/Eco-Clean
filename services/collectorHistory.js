import connectDB from "@/lib/db/connect";
import WasteReport from "@/models/WasteReport";
import "@/models/ServiceZone";

export const HISTORY_STATUSES = ["COLLECTED", "UNABLE_TO_COLLECT"];

// Read-only. Only this collector's own finished jobs. The person who made the report is never selected.
export async function listCollectorHistory(collectorId, options) {
  const opts = options || {};
  const pageSize = opts.pageSize || 20;
  const page = Math.max(1, opts.page || 1);
  const statuses = HISTORY_STATUSES.includes(opts.status) ? [opts.status] : HISTORY_STATUSES;

  await connectDB();
  const filter = { assignedCollector: collectorId, deletedAt: null, status: { $in: statuses } };

  const [reports, total] = await Promise.all([
    WasteReport.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate("serviceZone", "name")
      .select("reportId status serviceZone statusHistory")
      .lean(),
    WasteReport.countDocuments(filter),
  ]);

  const items = reports.map((r) => {
    const history = Array.isArray(r.statusHistory) ? r.statusHistory : [];
    const entry = history.slice().reverse().find((h) => h && h.status === r.status);
    return {
      reportId: r.reportId,
      status: r.status,
      zoneName: r.serviceZone ? r.serviceZone.name : "-",
      finishedAt: entry && entry.at ? entry.at : null,
      note: entry && entry.note ? entry.note : "",
    };
  });

  return { items: items, total: total };
}
