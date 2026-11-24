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
