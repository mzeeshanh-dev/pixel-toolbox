import { expect, test } from "@playwright/test";

const tools = [
  { name: /QR Code Generator/, path: "/qr-generator", heading: "QR Code Generator" },
  { name: /Video to GIF/, path: "/video-to-gif", heading: "Video to GIF" },
  { name: /Image Converter & Compressor/, path: "/image-tools", heading: "Image Converter & Compressor" },
];

test.describe("homepage", () => {
  for (const tool of tools) {
    test(`navigates to ${tool.path}`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("main").getByRole("link", { name: tool.name }).click();
      await expect(page).toHaveURL(tool.path);
      await expect(page.getByRole("heading", { level: 1, name: tool.heading })).toBeVisible();
      await expect(page.getByRole("link", { name: "All tools" })).toBeVisible();
    });
  }

  test("does not load FFmpeg or tool libraries on the homepage", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => requested.push(request.url()));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(requested.some((url) => url.includes("/vendor/ffmpeg/"))).toBe(false);
    expect(requested.some((url) => url.endsWith(".wasm"))).toBe(false);
  });

  test("theme toggle switches to dark mode and persists", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Change colour theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("health endpoint exposes only basic status", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
  });

  test("unknown routes show the not-found page", async ({ page }) => {
    const response = await page.goto("/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
