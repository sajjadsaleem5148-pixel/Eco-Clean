import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/roles";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS } from "@/lib/analyticsDatasets";
import { toCsv } from "@/lib/csv";
import { loadDataset } from "@/services/analytics";
import { writeAudit } from "@/lib/audit/log";
import { hit, makeKey } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

function plain(status, message) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  // Permission is checked on the server for every request, whatever the page showed.
  const user = await getCurrentUser();
  if (!user) return plain(401, "Please log in.");
  if (!hasPermission(user.role, "analytics.export")) {
    return plain(403, "You do not have permission to export data.");
  }

  const params = new URL(request.url).searchParams;
  const key = params.get("dataset") || "";
  if (!Object.prototype.hasOwnProperty.call(DATASETS, key)) return plain(400, "Unknown dataset.");

  const range = parseRange(params.get("from") || "", params.get("to") || "");
  if (range.error) return plain(400, range.error);

  const zone = params.get("zone") || "";
  if (zone && !/^[a-f\d]{24}$/i.test(zone)) return plain(400, "Invalid zone.");

  try {
    const limit = await hit(makeKey("export", user.id), 20, 60 * 60);
    if (!limit.ok) return plain(429, "Too many exports. Please try again later.");

    const zoneId = DATASETS[key].zone ? zone : "";
    const rows = await loadDataset(key, range, zoneId);

    await writeAudit({
      actor: user.id,
      action: "export.download",
      targetType: "Export",
      targetId: key,
      metadata: { from: range.fromStr, to: range.toStr, zone: zoneId || "all", rows: rows.length },
    });

    const csv = toCsv(DATASETS[key].columns, rows);
    const filename = key + "_" + range.fromStr + "_to_" + range.toStr + ".csv";
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Export failed:", err.message);
    return plain(500, "The export failed. Please try again.");
  }
}
