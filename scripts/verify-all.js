const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder.");
  process.exit(1);
}

const quick = process.argv.includes("quick");
const summary = [];
const report = [];
let problems = 0;

function say(line) {
  summary.push(line);
}

function bad(line) {
  problems++;
  say(" PROBLEM " + line);
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
function clean(text) {
  return String(text || "")
    .replace(ANSI, "")
    .replace(/\r/g, "\n")
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/g, "mongodb://[hidden]");
}

function read(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch (e) {
    return null;
  }
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".next") walk(p, out);
    } else if (e.name.endsWith(".js")) {
      out.push(p);
    }
  });
  return out;
}

function run(command) {
  const started = Date.now();
  const r = spawnSync(command, { shell: true, encoding: "utf8", maxBuffer: 200 * 1024 * 1024 });
  const out = clean((r.stdout || "") + "\n" + (r.stderr || ""));
  return { code: r.status, out: out, seconds: Math.round((Date.now() - started) / 1000) };
}

function git(args) {
  const r = spawnSync("git " + args, { shell: true, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").trim() };
}

function excerpt(out) {
  const lines = out.split("\n");
  let at = lines.findIndex(function (l) {
    return /(Module not found|Build error|Failed to compile|AssertionError|FAIL |Error:)/.test(l);
  });
  if (at < 0) at = Math.max(0, lines.length - 15);
  return lines
    .slice(at, at + 14)
    .map(function (l) {
      return "     " + l;
    })
    .join("\n");
}

// ---------- 1) Module files ----------
say("1) Module files");
const modules = [
  ["Zones edit", "lib/zoneStatus.js"],
  ["Schedules", "models/CollectionSchedule.js"],
  ["Household zone", "actions/household.js"],
  ["Notifications", "models/Notification.js"],
  ["Analytics and exports", "services/analytics.js"],
  ["Settings", "models/SiteSettings.js"],
  ["Waste categories", "actions/categories.js"],
  ["System pages", "services/systemStatus.js"],
  ["Missed pickups", "services/overdue.js"],
  ["Vehicles", "models/Vehicle.js"],
  ["Vendors", "models/Vendor.js"],
  ["Neighborhoods", "models/Neighborhood.js"],
  ["Campaigns", "models/Campaign.js"],
  ["Assignments", "services/assignments.js"],
  ["Households by zone", "services/zoneCoverage.js"],
  ["Support overview", "services/supportOverview.js"],
  ["Resident profile", "actions/profile.js"],
  ["Collector history", "services/collectorHistory.js"],
  ["Routes", "models/CollectionRoute.js"],
  ["Banners", "models/Banner.js"],
  ["Testimonials", "models/Testimonial.js"],
  ["Notification bell", "components/layout/NotificationBell.js"],
  ["Review form (build fix)", "components/forms/ReportReviewForm.js"],
  ["Shared components", "components/ui/StatusBadge.js"],
  ["Design system", "components/layout/NavLinks.js"],
  ["Integration tests", "tests/integration/points.test.js"],
];
modules.forEach(function (m) {
  if (fs.existsSync(m[1])) say(" OK       " + m[0]);
  else bad("MISSING " + m[0] + " (" + m[1] + ")");
});

// ---------- 2) Wiring ----------
say("");
say("2) Wiring inside older files");
[
  "actions/reports.js",
  "actions/adminReports.js",
  "actions/assignments.js",
  "actions/collectorJobs.js",
  "actions/complaints.js",
  "actions/adminComplaints.js",
  "actions/points.js",
  "actions/rewards.js",
].forEach(function (f) {
  const src = read(f);
  if (src !== null && src.includes("@/services/notifications")) say(" OK       notifications in " + f);
  else bad("NOT WIRED notifications in " + f);
});
[
  ["Sidebar: Waste Categories link", "lib/navigation.js", "/admin/categories"],
  ["Sidebar: Testimonials link", "lib/navigation.js", "/admin/testimonials"],
  ["Footer: Testimonials link", "components/layout/Footer.js", "/testimonials"],
  ["Header: notification bell", "components/layout/PortalShell.js", "NotificationBell"],
  ["Public layout: banners", "app/(public)/layout.js", "listPublicBanners"],
  ["Design tokens", "app/globals.css", "--color-brand"],
  ["Register form in English", "components/forms/RegisterForm.js", "Create account"],
].forEach(function (c) {
  const src = read(c[1]);
  if (src !== null && src.includes(c[2])) say(" OK       " + c[0]);
  else bad("NOT FOUND " + c[0] + " (" + c[1] + ")");
});

// ---------- 3) Old Mongoose option ----------
say("");
say("3) Old Mongoose option (new: true)");
const oldOption = [];
["actions", "services", "lib", "app", "models", "components"].forEach(function (d) {
  walk(d, []).forEach(function (f) {
    const src = read(f);
    if (src && /\bnew:\s*true\b/.test(src)) oldOption.push(f.replace(/\\/g, "/"));
  });
});
if (oldOption.length === 0) say(" OK       none left");
else {
  bad("new: true still in " + oldOption.length + " file(s): run node scripts/fix-mongoose-option.js");
  oldOption.slice(0, 10).forEach(function (f) {
    say("          " + f);
  });
}

// ---------- 4) Placeholder pages ----------
say("");
say("4) Pages that are still placeholders");
const placeholders = walk("app", [])
  .filter(function (f) {
    const src = read(f);
    return f.endsWith("page.js") && src && src.includes("PlaceholderPage");
  })
  .map(function (f) {
    return f.replace(/\\/g, "/");
  });
say(" Total: " + placeholders.length);
placeholders.forEach(function (f) {
  say("          " + f);
});

// ---------- 5) Git ----------
say("");
say("5) Git");
const tracked = git("ls-files .env.local");
if (tracked.out) bad("CRITICAL: .env.local is tracked by git. Tell me before doing anything else.");
else say(" OK       .env.local is not tracked");
const changed = git("status --porcelain").out.split("\n").filter(Boolean).length;
say(" Files changed but not committed: " + changed);
const ahead = git("rev-list --count @{u}..HEAD");
say(" Commits not pushed: " + (ahead.code === 0 ? ahead.out : "unknown"));

// ---------- 6) Tests and build ----------
say("");
if (quick) {
  say("6) Tests and build: skipped (quick mode)");
} else {
  say("6) Tests and build (this can take several minutes)");
  console.log("Running npm test ...");
  const unit = run("npm test");
  report.push("===== npm test =====\n" + unit.out);
  const uf = (unit.out.match(/Test Files\s+.*/) || [""])[0].trim();
  const ut = (unit.out.match(/^\s*Tests\s+.*/m) || [""])[0].trim();
  if (unit.code === 0) say(" OK       npm test: " + uf + " | " + ut + " (" + unit.seconds + "s)");
  else {
    bad("npm test failed: " + uf + " | " + ut);
    say(excerpt(unit.out));
  }

  console.log("Running npm run test:integration ...");
  const integ = run("npm run test:integration");
  report.push("===== npm run test:integration =====\n" + integ.out);
  const jf = (integ.out.match(/Test Files\s+.*/) || [""])[0].trim();
  const jt = (integ.out.match(/^\s*Tests\s+.*/m) || [""])[0].trim();
  if (integ.code === 0) say(" OK       integration: " + jf + " | " + jt + " (" + integ.seconds + "s)");
  else {
    bad("integration tests failed: " + jf + " | " + jt);
    say(excerpt(integ.out));
  }

  console.log("Running npm run build ...");
  const build = run("npm run build");
  report.push("===== npm run build =====\n" + build.out);
  if (build.code === 0 && /Compiled successfully/.test(build.out)) {
    const pages = (build.out.match(/Generating static pages[^\n]*\((\d+)\/(\d+)\)/g) || []).pop() || "";
    say(" OK       build compiled (" + build.seconds + "s) " + pages.trim());
  } else {
    bad("build failed");
    say(excerpt(build.out));
  }
}

// ---------- Output ----------
fs.writeFileSync("verify-report.txt", clean(report.join("\n\n")) + "\n\n" + summary.join("\n") + "\n", "utf8");
const ignore = read(".gitignore") || "";
if (!/^verify-report\.txt$/m.test(ignore)) {
  fs.appendFileSync(".gitignore", (ignore.endsWith("\n") || ignore === "" ? "" : "\n") + "verify-report.txt\n");
}

console.log("\n==================== SUMMARY (copy from here) ====================");
console.log(summary.join("\n"));
console.log("");
console.log(problems === 0 ? "RESULT: ALL CHECKS PASSED" : "RESULT: " + problems + " PROBLEM(S) FOUND");
console.log("==================== END OF SUMMARY ====================");
console.log("Full output (not for sharing): verify-report.txt");
process.exit(problems === 0 ? 0 : 1);