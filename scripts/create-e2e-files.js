const fs = require("fs");
const path = require("path");

if (!fs.existsSync("package.json") || !fs.existsSync("app")) {
  console.error("FAILED: Run this script from the project root folder. Nothing was written.");
  process.exit(1);
}

const required = [
  "lib/db/connect.js",
  "node_modules/@playwright/test",
  "node_modules/mongodb-memory-server",
  "node_modules/mongoose",
  "node_modules/bcryptjs",
];
const missing = required.filter((f) => !fs.existsSync(f));
if (missing.length > 0) {
  console.error("FAILED: These were not found (run npm install first):");
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

write("playwright.config.cjs", `
const { defineConfig, devices } = require("@playwright/test");

// These tests need the temporary test database and test accounts that the runner creates.
if (!process.env.E2E_ADMIN_EMAIL) {
  throw new Error("Run these tests with: npm run test:e2e");
}

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: Object.assign({}, devices["Desktop Chrome"]) }],
});
`);

write("tests/e2e/helpers.cjs", `
const { expect } = require("@playwright/test");

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const RESIDENT_PASSWORD = "E2e-Resident-Pass-1";

function uniqueEmail(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000) + "@example.test";
}

async function fillLogin(page, email, password) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
}

async function loginResident(page, email, password) {
  await page.goto("/login");
  await fillLogin(page, email, password);
  await page.waitForURL((url) => url.pathname.indexOf("/dashboard") === 0);
}

async function loginAdmin(page) {
  await page.goto("/admin/login");
  await fillLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL((url) => url.pathname.indexOf("/admin") === 0 && url.pathname.indexOf("login") < 0);
}

// Registers through the real form. If the site sends the new resident to the login page, it signs in too.
async function registerResident(page, email, password) {
  await page.goto("/register");
  await page.getByLabel(/full name/i).fill("E2E Resident");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL((url) => url.pathname.indexOf("/dashboard") === 0 || url.pathname.indexOf("/login") === 0);
  if (page.url().indexOf("/login") >= 0) {
    await fillLogin(page, email, password);
    await page.waitForURL((url) => url.pathname.indexOf("/dashboard") === 0);
  }
  await expect(page.getByText(/welcome/i).first()).toBeVisible();
}

// Works whether the field is a drop-down or a set of radio buttons.
async function pickFirst(page, name) {
  const select = page.locator('select[name="' + name + '"]');
  if ((await select.count()) > 0) {
    await select.selectOption({ index: 1 });
    return;
  }
  await page.locator('input[name="' + name + '"]').first().check();
}

module.exports = { ADMIN_EMAIL, ADMIN_PASSWORD, RESIDENT_PASSWORD, uniqueEmail, fillLogin, loginResident, loginAdmin, registerResident, pickFirst };
`);

write("tests/e2e/public.spec.cjs", `
const { test, expect } = require("@playwright/test");

const paths = [
  "/", "/services", "/waste-segregation", "/rewards", "/schedule", "/contact", "/about", "/privacy",
  "/terms", "/complaints", "/campaigns", "/testimonials", "/learn", "/login", "/register", "/admin/login",
];

test.describe("public pages open", () => {
  for (const p of paths) {
    test("opens without an error: " + p, async ({ page }) => {
      const res = await page.goto(p);
      expect(res.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }
});

test.describe("empty states say so plainly", () => {
  test("about is not invented", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByText("This page has not been published yet.")).toBeVisible();
  });

  test("schedule, testimonials, learn and campaigns are empty", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page.getByText("No collection schedules have been confirmed yet.")).toBeVisible();
    await page.goto("/testimonials");
    await expect(page.getByText("No testimonials have been published yet.")).toBeVisible();
    await page.goto("/learn");
    await expect(page.getByText("No articles have been published yet.")).toBeVisible();
    await page.goto("/campaigns");
    await expect(page.getByText("There are no campaigns right now.")).toBeVisible();
  });

  test("the waste guide shows the category from the database", async ({ page }) => {
    await page.goto("/waste-segregation");
    await expect(page.getByText(process.env.E2E_CATEGORY_NAME).first()).toBeVisible();
  });

  test("an unknown address gives 404", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res.status()).toBe(404);
  });
});

test.describe("small phone screen", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  for (const p of ["/", "/services", "/waste-segregation", "/contact", "/login", "/register"]) {
    test("no sideways scrolling: " + p, async ({ page }) => {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
`);

write("tests/e2e/auth.spec.cjs", `
const { test, expect } = require("@playwright/test");
const { RESIDENT_PASSWORD, uniqueEmail, fillLogin, loginAdmin, registerResident } = require("./helpers.cjs");

test.describe("sign in and access", () => {
  test("a wrong password gives one plain message", async ({ page }) => {
    await page.goto("/login");
    await fillLogin(page, uniqueEmail("nobody"), "Wrong-Password-123");
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/login/);
  });

  test("a visitor is sent to the login page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/);
    await page.goto("/collector");
    await expect(page).toHaveURL(/login/);
  });

  test("a resident can register and cannot open admin pages", async ({ page }) => {
    await registerResident(page, uniqueEmail("resident"), RESIDENT_PASSWORD);
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/admin.users/);
    await page.goto("/admin/audit-logs");
    await expect(page).not.toHaveURL(/audit-logs/);
    await page.goto("/collector/jobs");
    await expect(page).not.toHaveURL(/collector.jobs/);
  });

  test("the administrator can sign in and open the audit log", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await page.goto("/admin/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit Logs" })).toBeVisible();
  });
});
`);

write("tests/e2e/report-flow.spec.cjs", `
const { test, expect } = require("@playwright/test");
const { RESIDENT_PASSWORD, uniqueEmail, loginAdmin, loginResident, registerResident, pickFirst } = require("./helpers.cjs");

test.describe.configure({ mode: "serial" });

const email = uniqueEmail("flow");
let reportId = "";

test.describe("report, review, assign", () => {
  test("a resident registers and submits a report", async ({ page }) => {
    await registerResident(page, email, RESIDENT_PASSWORD);
    await page.goto("/report-garbage");
    await pickFirst(page, "category");
    await pickFirst(page, "serviceZone");
    await page.locator('[name="description"]').fill("A pile of waste near the corner shop");
    await page.locator('[name="address"]').fill("12 Main Street");
    await page.locator('form:has([name="address"]) button[type="submit"]').click();
    await page.waitForURL("**/dashboard/reports/ECR-*");
    reportId = page.url().split("/").pop();
    expect(reportId.indexOf("ECR-")).toBe(0);
    await expect(page.getByText(/submitted/i).first()).toBeVisible();
  });

  test("the administrator verifies the report", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/reports/" + reportId);
    await page.locator('select[name="decision"]').selectOption("VERIFIED");
    await page.getByRole("button", { name: /save decision/i }).click();
    await expect(page.getByText("Report updated.")).toBeVisible();
  });

  test("the administrator assigns the collector", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/admin/reports/" + reportId);
    await page.locator('select[name="collectorId"]').selectOption({ index: 1 });
    await page.locator('form:has(select[name="collectorId"]) button[type="submit"]').click();
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(page.getByText(/assigned/i).first()).toBeVisible();
  });

  test("the resident sees the new status and a notification", async ({ page }) => {
    await loginResident(page, email, RESIDENT_PASSWORD);
    await page.goto("/dashboard/reports/" + reportId);
    await expect(page.getByText(/assigned/i).first()).toBeVisible();
    await page.goto("/dashboard/notifications");
    await expect(page.getByText("Your report was verified")).toBeVisible();
  });
});
`);

write("scripts/run-e2e.js", `
// Starts a temporary in-memory database, seeds a few test records, starts the site on its own port,
// runs the Playwright tests, and cleans everything up. The real database is never used.
const fs = require("fs");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const PORT = process.env.E2E_PORT || "3100";
const BASE = "http://localhost:" + PORT;
const ids = {
  adminEmail: "e2e-admin@example.test",
  adminPassword: "E2e-Admin-Pass-12345",
  collectorEmail: "e2e-collector@example.test",
  collectorPassword: "E2e-Collector-Pass-12345",
  zoneName: "E2E Zone",
  categoryName: "E2E Plastic",
};

let replSet = null;
let server = null;
let serverExited = false;

async function seed(uri) {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const now = new Date();
  const zone = await db.collection("servicezones").insertOne({
    name: ids.zoneName, slug: "e2e-zone", status: "ACTIVE", targetCollectionEveryDays: 3,
    deletedAt: null, createdAt: now, updatedAt: now,
  });
  const category = await db.collection("wastecategories").insertOne({
    key: "e2e-plastic", name: ids.categoryName, color: "#1d4ed8", status: "ACTIVE", sortOrder: 1,
    acceptedMaterials: [], prohibitedMaterials: [], createdAt: now, updatedAt: now,
  });
  await db.collection("pointsearningrules").insertOne({
    category: category.insertedId, points: 10, active: true, createdAt: now, updatedAt: now,
  });
  const adminHash = await bcrypt.hash(ids.adminPassword, 10);
  const collectorHash = await bcrypt.hash(ids.collectorPassword, 10);
  await db.collection("users").insertMany([
    {
      name: "E2E Admin", email: ids.adminEmail, passwordHash: adminHash, role: "SUPER_ADMIN", status: "ACTIVE",
      isRootAdmin: true, sessionVersion: 0, deletedAt: null, createdAt: now, updatedAt: now,
    },
    {
      name: "E2E Collector", email: ids.collectorEmail, passwordHash: collectorHash, role: "COLLECTOR", status: "ACTIVE",
      serviceZone: zone.insertedId, sessionVersion: 0, deletedAt: null, createdAt: now, updatedAt: now,
    },
  ]);
  await mongoose.disconnect();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSite() {
  for (let i = 0; i < 150; i++) {
    if (serverExited) throw new Error("The site stopped while starting. See e2e-server.log");
    try {
      const res = await fetch(BASE + "/api/db-health");
      if (res.status === 200) return;
    } catch (err) {
      // not ready yet
    }
    await sleep(1000);
  }
  throw new Error("The site did not become ready in time. See e2e-server.log");
}

function stopSite() {
  if (!server || serverExited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
  } else {
    server.kill("SIGTERM");
  }
}

async function cleanup() {
  stopSite();
  if (replSet) {
    try {
      await replSet.stop();
    } catch (err) {
      // ignore
    }
  }
}

async function main() {
  let code = 1;
  try {
    console.log("Starting a temporary test database...");
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri("ecoclean_e2e");
    if (!(uri.startsWith("mongodb://127.0.0.1") || uri.startsWith("mongodb://localhost"))) {
      throw new Error("Refusing to run: the test database must be a local in-memory server.");
    }
    await seed(uri);

    console.log("Starting the site on " + BASE + " (first start is slow)...");
    const logFd = fs.openSync("e2e-server.log", "w");
    const env = Object.assign({}, process.env, {
      MONGODB_URI: uri,
      AUTH_SECRET: crypto.randomBytes(32).toString("base64"),
      APP_URL: BASE,
      AUTH_URL: BASE,
      NEXT_TELEMETRY_DISABLED: "1",
    });
    server = spawn("npx", ["next", "dev", "-p", PORT], { env: env, shell: true, stdio: ["ignore", logFd, logFd] });
    server.on("exit", () => {
      serverExited = true;
    });
    await waitForSite();

    console.log("Running the browser tests...");
    const testEnv = Object.assign({}, process.env, {
      E2E_BASE_URL: BASE,
      E2E_ADMIN_EMAIL: ids.adminEmail,
      E2E_ADMIN_PASSWORD: ids.adminPassword,
      E2E_COLLECTOR_EMAIL: ids.collectorEmail,
      E2E_COLLECTOR_PASSWORD: ids.collectorPassword,
      E2E_ZONE_NAME: ids.zoneName,
      E2E_CATEGORY_NAME: ids.categoryName,
    });
    const result = spawnSync("npx", ["playwright", "test"].concat(process.argv.slice(2)), {
      stdio: "inherit", shell: true, env: testEnv,
    });
    code = result.status === null ? 1 : result.status;
  } catch (err) {
    console.error("\\nFAILED: " + err.message);
  } finally {
    await cleanup();
  }
  process.exit(code);
}

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});

main();
`);

// ---- package.json: add "test:e2e" ----
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.scripts = pkg.scripts || {};
if (pkg.scripts["test:e2e"] !== "node scripts/run-e2e.js") {
  pkg.scripts["test:e2e"] = "node scripts/run-e2e.js";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("Patched: package.json (npm run test:e2e added)");
}

// ---- .gitignore: keep test output out of git ----
const ignoreFile = ".gitignore";
let ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, "utf8") : "";
["test-results/", "playwright-report/", "blob-report/", "e2e-server.log"].forEach((line) => {
  const found = ignore.split(/\r?\n/).indexOf(line) >= 0;
  if (!found) {
    ignore += (ignore.endsWith("\n") || ignore === "" ? "" : "\n") + line + "\n";
  }
});
fs.writeFileSync(ignoreFile, ignore, "utf8");

// ---- Verification ----
const SRV = "mongodb" + "+srv://";
const ENVFILE = ".env" + ".local";
let failed = 0;
console.log("\nVerification:");
written.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const problems = [];
  if (!src.trim()) problems.push("empty");
  if (src.includes(SRV) || src.includes(ENVFILE)) problems.push("must never reference Atlas or the real env file");
  if (src.includes("localhost:3000")) problems.push("must not use the normal dev port");
  if (f === "scripts/run-e2e.js") {
    if (!src.includes("Refusing to run") || !src.includes("127.0.0.1")) problems.push("local-only guard is missing");
  }
  if (f === "playwright.config.cjs" && !src.includes("Run these tests with")) problems.push("safety message missing");
  if (problems.length > 0) {
    console.log(" FAIL (" + problems.join(", ") + "): " + f);
    failed++;
  } else {
    console.log(" OK: " + f);
  }
});
const checked = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (checked.scripts && checked.scripts["test:e2e"] === "node scripts/run-e2e.js") {
  console.log(" OK: package.json (test:e2e present)");
} else {
  console.log(" FAIL: package.json is missing test:e2e");
  failed++;
}

if (failed > 0) {
  console.error("\nFAILED: " + failed + " item(s) need attention.");
  process.exit(1);
}
console.log("\nALL OK: " + written.length + " files written and checked.");
console.log("Next: npx playwright install chromium   (once), then: npm run test:e2e");