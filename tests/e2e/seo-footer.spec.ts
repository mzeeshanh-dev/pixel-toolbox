import { expect, test } from "@playwright/test";
import sharp from "sharp";

test.describe("footer", () => {
  test("shows the current year, author credit and social links", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText(`Copyright © ${new Date().getFullYear()} Pixel Toolbox`);
    await expect(footer).toContainText("Made with");
    await expect(footer.getByRole("link", { name: "Zeeshan", exact: true })).toHaveAttribute(
      "href",
      "https://m-zeeshan-haider.vercel.app/",
    );
    await expect(footer.getByRole("link", { name: "@mzeeshanh-dev" })).toHaveAttribute("href", "https://github.com/mzeeshanh-dev/");
    await expect(footer.getByRole("link", { name: /on LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/m-zeeshan-haider-606bb3284/",
    );
    await expect(footer.getByRole("link", { name: /on GitHub/ })).toHaveAttribute("target", "_blank");
    await expect(footer.getByRole("link", { name: /on Portfolio/ })).toHaveAttribute("rel", /noopener/);
  });
});

test.describe("SEO", () => {
  for (const path of ["/", "/qr-generator", "/video-to-gif", "/image-tools"]) {
    test(`${path} has title, description, canonical, Open Graph and valid JSON-LD`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(/Pixel Toolbox/);
      expect((await page.locator('meta[name="description"]').getAttribute("content"))!.length).toBeGreaterThan(80);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toContain(path === "/" ? "" : path);
      expect(await page.locator('meta[property="og:image"]').first().getAttribute("content")).toContain("opengraph-image");
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(blocks.length).toBeGreaterThan(0);
      const types = blocks.flatMap((text) => {
        const json = JSON.parse(text);
        return (json["@graph"] ?? [json]).map((node: { "@type": string }) => node["@type"]);
      });
      expect(types).toContain(path === "/" ? "FAQPage" : "WebApplication");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    });
  }

  test("sitemap, robots and manifest are served", async ({ request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const path of ["/qr-generator", "/video-to-gif", "/image-tools"]) expect(sitemap).toContain(path);
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
    expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
    expect((await request.get("/apple-icon")).headers()["content-type"]).toContain("image/png");
  });
});

test.describe("paste to load", () => {
  test("pasting an image with Ctrl+V loads it into the image tool", async ({ page }) => {
    await page.goto("/image-tools");
    await page.waitForLoadState("networkidle"); // listeners attach after hydration
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#4f46e5" } }).png().toBuffer();
    await page.evaluate((bytes) => {
      const file = new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" });
      const data = new DataTransfer();
      data.items.add(file);
      document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, [...png]);
    await expect(page.getByText("pasted.png")).toBeVisible();
  });

  test("dropping a video anywhere on the page loads it", async ({ page }) => {
    await page.goto("/video-to-gif");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(["not a video"], "notes.mp4", { type: "video/mp4" }));
      window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data, bubbles: true }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    });
    // The fake file is picked up and validated (and rejected) — proving the drop reached the tool.
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/not a recognised video/i);
  });
});
