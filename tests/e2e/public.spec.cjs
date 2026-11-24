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
