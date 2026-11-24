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
