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
    console.error("\nFAILED: " + err.message);
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
