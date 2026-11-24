const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "models/WasteReport.js",
  "models/ServiceZone.js",
  "models/User.js",
  "models/GreenPointsTransaction.js",
  "models/RewardOrder.js",
  "components/dashboard/StatCard.js",
  "components/ui/EmptyState.js",
  "components/ui/ErrorNotice.js",
  "components/layout/Footer.js",
  "tests/integration/helpers.js",
  "vitest.config.mjs",
  "vitest.integration.config.mjs",
  "node_modules/vitest",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These files were not found, run their scripts first:");
  missing.forEach((f) => console.error(" - " + f));
  console.error("Nothing was written.");
  process.exit(1);
}

const written = [];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart(), "utf8");
  written.push(file);
  console.log("Written:", file);
}

write("lib/impactFormat.js", `
// A whole number with thousands separators. Anything that is not a real count shows as a dash.
export function formatCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-";
  return Math.floor(value).toLocaleString("en-US");
}

export function isAllZero(figures) {
  if (!figures) return false;
  const values = Object.keys(figures).map((k) => figures[k]);
  return values.length > 0 && values.every((v) => v === 0);
}
`);

write("services/impact.js", `
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
`);

write("app/(public)/impact/page.js", `
import { getImpactFigures } from "@/services/impact";
import { formatCount, isAllZero } from "@/lib/impactFormat";
import StatCard from "@/components/dashboard/StatCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNotice from "@/components/ui/ErrorNotice";

export const metadata = { title: "Our Impact | ECO-CLEAN" };
export const dynamic = "force-dynamic";

function show(value) {
  return value === null || value === undefined ? null : formatCount(value);
}

export default async function ImpactPage() {
  const f = await getImpactFigures();
  const unavailable = Object.keys(f).every((k) => f[k] === null);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-emerald-900">Our Impact</h1>
      <p className="mt-2 text-sm text-gray-700">
        These are live counts from the ECO-CLEAN database. They are not estimates. Recycling and composting outcomes
        are not shown, because no verified processing records exist yet.
      </p>

      {unavailable && (
        <div className="mt-6">
          <ErrorNotice>The figures are temporarily unavailable. Please try again later.</ErrorNotice>
        </div>
      )}

      {!unavailable && isAllZero(f) && (
        <div className="mt-6">
          <EmptyState>The platform has just started, so every figure is still zero.</EmptyState>
        </div>
      )}

      {!unavailable && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Garbage reports collected" value={show(f.reportsCollected)} />
          <StatCard label="Garbage reports submitted" value={show(f.reportsSubmitted)} />
          <StatCard label="Active service zones" value={show(f.activeZones)} />
          <StatCard label="Active residents" value={show(f.activeResidents)} />
          <StatCard label="Reward orders completed" value={show(f.ordersCompleted)} />
          <StatCard label="Green Points earned in total" value={show(f.pointsEarned)} />
        </ul>
      )}
    </main>
  );
}
`);

write("tests/unit/impactFormat.test.js", `
import { describe, it, expect } from "vitest";
import { formatCount, isAllZero } from "@/lib/impactFormat";

describe("formatCount", () => {
  it("adds thousands separators and keeps zero", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("shows a dash for anything that is not a real count", () => {
    [null, undefined, NaN, Infinity, -5, "5", {}].forEach((v) => expect(formatCount(v)).toBe("-"));
  });
});

describe("isAllZero", () => {
  it("is true only when every figure is zero", () => {
    expect(isAllZero({ a: 0, b: 0 })).toBe(true);
    expect(isAllZero({ a: 0, b: 1 })).toBe(false);
    expect(isAllZero({ a: 0, b: null })).toBe(false);
    expect(isAllZero({})).toBe(false);
    expect(isAllZero(undefined)).toBe(false);
  });
});
`);

write("tests/integration/impact.test.js", `
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { connectTestDb, clearDb, disconnectTestDb, makeUser, makeReport, newId } from "./helpers.js";
import { getImpactFigures } from "@/services/impact";
import WasteReport from "@/models/WasteReport";
import ServiceZone from "@/models/ServiceZone";
import GreenPointsTransaction from "@/models/GreenPointsTransaction";
import RewardOrder from "@/models/RewardOrder";

beforeAll(connectTestDb);
beforeEach(clearDb);
afterAll(disconnectTestDb);

describe("getImpactFigures", () => {
  it("returns zeros on an empty database", async () => {
    expect(await getImpactFigures()).toEqual({
      reportsCollected: 0,
      reportsSubmitted: 0,
      activeZones: 0,
      activeResidents: 0,
      ordersCompleted: 0,
      pointsEarned: 0,
    });
  });

  it("counts collected and submitted reports and ignores deleted ones", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "COLLECTED");
    await makeReport(resident._id, newId(), "COLLECTED");
    await makeReport(resident._id, newId(), "SUBMITTED");
    const gone = await makeReport(resident._id, newId(), "COLLECTED");
    await WasteReport.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });

    const f = await getImpactFigures();
    expect(f.reportsCollected).toBe(2);
    expect(f.reportsSubmitted).toBe(3);
  });

  it("counts active zones and active residents only", async () => {
    await ServiceZone.create({ name: "Zone A", slug: "zone-a" });
    await ServiceZone.create({ name: "Zone B", slug: "zone-b", status: "INACTIVE" });
    await makeUser();
    await makeUser({ status: "SUSPENDED" });
    await makeUser({ role: "COLLECTOR" });
    await makeUser({ role: "SUPER_ADMIN" });

    const f = await getImpactFigures();
    expect(f.activeZones).toBe(1);
    expect(f.activeResidents).toBe(1);
  });

  it("counts completed orders and adds up only earned points", async () => {
    const user = await makeUser();
    await RewardOrder.collection.insertMany([
      { orderNumber: "RO-1", status: "COMPLETED", user: user._id },
      { orderNumber: "RO-2", status: "PENDING", user: user._id },
    ]);
    await GreenPointsTransaction.collection.insertMany([
      { user: user._id, type: "EARN", points: 10 },
      { user: user._id, type: "EARN", points: 15 },
      { user: user._id, type: "REDEEM", points: -20 },
      { user: user._id, type: "REFUND", points: 20 },
    ]);

    const f = await getImpactFigures();
    expect(f.ordersCompleted).toBe(1);
    expect(f.pointsEarned).toBe(25);
  });

  it("returns only numbers and never a name, email or id", async () => {
    const resident = await makeUser();
    await makeReport(resident._id, newId(), "COLLECTED");
    const f = await getImpactFigures();
    Object.keys(f).forEach((k) => expect(typeof f[k]).toBe("number"));
    const text = JSON.stringify(f);
    expect(text.includes(resident.email)).toBe(false);
    expect(text.includes(resident.name)).toBe(false);
    expect(text.includes(String(resident._id))).toBe(false);
  });
});
`);

// ---- Footer link, with a backup. A missing anchor only gives a WARNING. ----
const footerFile = "components/layout/Footer.js";
const anchor = '<li><Link href="/testimonials" className={linkClass}>Testimonials</Link></li>';
const link = '<li><Link href="/impact" className={linkClass}>Our Impact</Link></li>';
let footerState = "";
{
  const src = fs.readFileSync(footerFile, "utf8");
  if (src.includes('"/impact"')) {
    footerState = "already";
  } else if (src.split(anchor).length - 1 !== 1) {
    footerState = "skipped";
  } else {
    const backupDir = "scripts/backup-impact";
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, "Footer.js.bak");
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, "utf8");
    const eol = src.includes("\r\n") ? "\r\n" : "\n";
    const at = src.indexOf(anchor);
    const indent = src.slice(src.lastIndexOf("\n", at) + 1, at);
    fs.writeFileSync(footerFile, src.replace(anchor, link + eol + indent + anchor), "utf8");
    footerState = "wired";
  }
}
console.log("\nFooter link: " + footerState.toUpperCase());
if (footerState === "skipped") {
  console.log("WARNING: the Testimonials link was not found exactly once in the footer. The page still works at /impact.");
}

// ---- Verification (comments are ignored) ----
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SRV = "mongodb" + "+srv://";
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const code = stripComments(src);
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes("PlaceholderPage")) problems.push("placeholder text");
  if (f.startsWith("tests/") && (code.includes(SRV) || code.includes("env.local"))) problems.push("tests must never reference Atlas");
  if ((f.startsWith("components/") || f.startsWith("app/")) &&
      /animate-|hover:scale|hover:-translate|transition|gradient|dangerouslySetInnerHTML/.test(code)) {
    problems.push("animation, gradient or raw HTML is not allowed");
  }
  if (f === "services/impact.js") {
    if (/updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|create\(/.test(code)) problems.push("service must be read-only");
    if (/\.find\(|reporter|email|passwordHash/.test(code)) problems.push("service must return counts only");
  }
  if (f === "app/(public)/impact/page.js" && !code.includes("<h1")) problems.push("page needs a main heading");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});

if (failed > 0) {
  console.error("\nFAILED: " + failed + " file(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked.");