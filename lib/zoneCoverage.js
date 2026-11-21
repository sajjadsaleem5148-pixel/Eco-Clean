// Turns grouped database counts into one row per zone. Pure logic, no database access.

// rows: [{ _id, count }]. A missing _id (no zone) is stored under the key "none".
export function toCountMap(rows) {
  const map = {};
  (rows || []).forEach((r) => {
    const key = r && r._id ? String(r._id) : "none";
    const count = r && typeof r.count === "number" ? r.count : 0;
    map[key] = (map[key] || 0) + count;
  });
  return map;
}

// Only an active zone can have a gap. An inactive zone is not expected to have staff or a schedule.
export function coverageGaps(row) {
  if (!row || row.status !== "ACTIVE") return [];
  const gaps = [];
  if (row.collectors === 0) gaps.push("No active collector");
  if (row.schedules === 0) gaps.push("No confirmed schedule");
  return gaps;
}

// zones: [{ _id, name, status }]
// maps: { residents, neighborhoods, collectors, schedules, openReports }, each made by toCountMap
export function buildCoverageRows(zones, maps) {
  const m = maps || {};
  const get = (name, id) => (m[name] && m[name][id]) || 0;
  const rows = (zones || []).map((z) => {
    const id = String(z._id);
    const row = {
      id: id,
      name: z.name,
      status: z.status,
      residents: get("residents", id),
      neighborhoods: get("neighborhoods", id),
      collectors: get("collectors", id),
      schedules: get("schedules", id),
      openReports: get("openReports", id),
    };
    row.gaps = coverageGaps(row);
    return row;
  });
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
