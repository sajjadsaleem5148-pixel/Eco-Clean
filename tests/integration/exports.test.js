import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => globalThis.__ecoUser || null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    const e = new Error("NEXT_REDIRECT");
    e.url = url;
    throw e;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { signInAs, signOut } from "./actionHelpers.js";
import { GET } from "@/app/api/admin/export/route";
import { loadOverview } from "@/services/analytics";
import { parseRange } from "@/lib/analyticsRange";
import { DATASETS, DATASET_KEYS } from "@/lib/analyticsDatasets";
import WasteReport from "@/models/WasteReport";
import Complaint from "@/models/Complaint";
import AuditLog from "@/models/AuditLog";

beforeAll(connectTestDb);
beforeEach(async () => {
  await clearDb();
  signOut();
});
afterAll(disconnectTestDb);

function request(query) {
  return GET(new Request("http://localhost/api/admin/export?" + new URLSearchParams(query).toString()));
}

async function asAdmin() {
  const admin = await makeUser({ role: "SUPER_ADMIN" });
  signInAs(admin);
  return admin;
}

function header(key) {
  return DATASETS[key].columns.map((c) => c.label).join(",") + "\r\n";
}

describe("export permissions", () => {
  it("refuses a visitor, a resident, an analyst and an operations manager", async () => {
    const none = await request({ dataset: "reports-by-status" });
    expect(none.status).toBe(401);

    for (const role of ["RESIDENT", "READ_ONLY_ANALYST", "OPERATIONS_MANAGER", "COLLECTOR"]) {
      const user = await makeUser({ role: role });
      signInAs(user);
      const res = await request({ dataset: "reports-by-status" });
      expect(res.status).toBe(403);
    }
    expect(await AuditLog.countDocuments({ action: "export.download" })).toBe(0);
  });
});

describe("export content", () => {
  it("returns a CSV with the right counts and download headers", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await asAdmin();

    const res = await request({ dataset: "reports-by-status" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="reports-by-status_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv"/
    );
    const body = await res.text();
    expect(body.split("\r\n")).toEqual(["Status,Reports", "COLLECTED,1", "SUBMITTED,2", ""]);
  });

  it("records every export in the audit log", async () => {
    const admin = await asAdmin();
    await request({ dataset: "points-by-type" });
    const logs = await AuditLog.find({ action: "export.download" }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].targetId).toBe("points-by-type");
    expect(String(logs[0].actor)).toBe(String(admin._id));
    expect(logs[0].metadata.rows).toBe(0);
  });

  it("returns only the header when there is nothing to export", async () => {
    await asAdmin();
    for (const key of DATASET_KEYS) {
      const res = await request({ dataset: key });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(header(key));
    }
  });

  it("respects the date range", async () => {
    const resident = await makeUser();
    const old = await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await WasteReport.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date("2020-01-15T00:00:00Z") } });
    await asAdmin();

    const recent = await (await request({ dataset: "reports-by-status" })).text();
    expect(recent.split("\r\n")).toEqual(["Status,Reports", "COLLECTED,1", ""]);

    const past = await (await request({ dataset: "reports-by-status", from: "2020-01-01", to: "2020-01-31" })).text();
    expect(past.split("\r\n")).toEqual(["Status,Reports", "SUBMITTED,1", ""]);
  });

  it("filters reports by zone", async () => {
    const resident = await makeUser();
    const inside = await makeReport(resident._id, newId(), "SUBMITTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const zone = newId();
    await WasteReport.updateOne({ _id: inside._id }, { $set: { serviceZone: zone } });
    await asAdmin();

    const res = await request({ dataset: "reports-by-status", zone: String(zone) });
    expect((await res.text()).split("\r\n")).toEqual(["Status,Reports", "SUBMITTED,1", ""]);
  });

  it("never puts a resident's name or email in any export", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "SUBMITTED");
    await Complaint.create({
      ticketNumber: "ECC-20261101-00000009",
      reporter: resident._id,
      category: "OTHER",
      description: "Test complaint description",
    });
    await asAdmin();

    for (const key of DATASET_KEYS) {
      const body = await (await request({ dataset: key })).text();
      expect(body.includes(resident.email)).toBe(false);
      expect(body.includes(resident.name)).toBe(false);
    }
  });
});

describe("export validation", () => {
  it("rejects unknown datasets, bad dates, long ranges and bad zones", async () => {
    await asAdmin();
    expect((await request({ dataset: "users" })).status).toBe(400);
    expect((await request({ dataset: "__proto__" })).status).toBe(400);
    expect((await request({})).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2026-02-30" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2026-05-02", to: "2026-05-01" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", from: "2024-01-01", to: "2026-01-01" })).status).toBe(400);
    expect((await request({ dataset: "reports-by-status", zone: "not-an-id" })).status).toBe(400);
    expect(await AuditLog.countDocuments({ action: "export.download" })).toBe(0);
  });

  it("limits each person to twenty exports per hour", async () => {
    await asAdmin();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await request({ dataset: "reports-by-status" })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("loadOverview averages", () => {
  it("averages the time to the first staff decision and to complaint resolution", async () => {
    const resident = await makeUser();
    const base = Date.now() - 10 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;

    for (const decisionHours of [2, 4]) {
      const r = await makeReport(resident._id, newId(), "VERIFIED");
      await WasteReport.collection.updateOne(
        { _id: r._id },
        {
          $set: {
            createdAt: new Date(base),
            statusHistory: [
              { status: "SUBMITTED", at: new Date(base) },
              { status: "VERIFIED", at: new Date(base + decisionHours * hour) },
            ],
          },
        }
      );
    }

    const c = await Complaint.create({
      ticketNumber: "ECC-20261101-00000001",
      reporter: resident._id,
      category: "OTHER",
      description: "Test complaint description",
      status: "RESOLVED",
      resolvedAt: new Date(),
    });
    await Complaint.collection.updateOne(
      { _id: c._id },
      { $set: { createdAt: new Date(base), resolvedAt: new Date(base + 2 * hour) } }
    );

    const overview = await loadOverview(parseRange("", ""), "");
    expect(overview.reviewHours).toEqual({ hours: 3, count: 2 });
    expect(overview.resolutionHours).toEqual({ hours: 2, count: 1 });
  });

  it("returns no average when nothing qualifies", async () => {
    const overview = await loadOverview(parseRange("", ""), "");
    expect(overview.reviewHours).toBeNull();
    expect(overview.resolutionHours).toBeNull();
  });
});
