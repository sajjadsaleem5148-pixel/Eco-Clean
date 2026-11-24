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
