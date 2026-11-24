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
