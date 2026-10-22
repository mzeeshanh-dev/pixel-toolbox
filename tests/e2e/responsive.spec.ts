import { expect, test } from "@playwright/test";

const routes = ["/", "/qr-generator", "/video-to-gif", "/image-tools", "/privacy"];
const widths = [360, 768, 1024, 1440];

test.describe("responsive layout", () => {
  for (const width of widths) {
    for (const route of routes) {
      test(`${route} has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test("mobile navigation opens and links to every tool", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Video to GIF" }).click();
    await expect(page).toHaveURL("/video-to-gif");
    await expect(nav).toBeHidden();
  });
});
