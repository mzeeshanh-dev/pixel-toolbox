import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/** Photo-like (noisy) semi-transparent PNG, so lossy formats genuinely come out smaller. */
async function transparentPng() {
  const width = 240;
  const height = 160;
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 7;
  for (let i = 0; i < pixels.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (i / 4) % width;
    pixels[i] = (x + (seed & 63)) & 255;
    pixels[i + 1] = (70 + ((seed >> 8) & 63)) & 255;
    pixels[i + 2] = 229 - ((seed >> 16) & 63);
    pixels[i + 3] = 128;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function uploadImage(page: Page, name: string, buffer: Buffer, mimeType = "image/png") {
  await page.getByLabel("Choose image").setInputFiles({ name, mimeType, buffer });
}

async function chooseOutputFormat(page: Page, label: RegExp) {
  await page.getByLabel("Output format").click();
  await page.getByRole("option", { name: label }).click();
}

test.describe("Image converter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/image-tools");
    await expect(page.getByRole("heading", { level: 1, name: /image converter/i })).toBeVisible();
  });

  test("converts a transparent PNG to WebP in the browser and downloads it", async ({ page }) => {
    let uploaded = false;
    page.on("request", (request) => {
      if (request.url().includes("/api/image/")) uploaded = true;
    });
    await uploadImage(page, "logo.png", await transparentPng());
    await expect(page.getByText("Processed in your browser.")).toBeVisible();
    await page.getByRole("button", { name: "Convert to WebP" }).click();
    await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /download webp/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("logo.webp");
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(uploaded).toBe(false);
  });

  test("converts to AVIF through the server route", async ({ page }) => {
    await uploadImage(page, "logo.png", await transparentPng());
    await chooseOutputFormat(page, /AVIF/);
    await expect(page.getByText(/Uploaded to the server for AVIF output/)).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/api/image/convert")),
      page.getByRole("button", { name: "Convert to AVIF" }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/avif");
    expect(response.headers()["cache-control"]).toContain("no-store");
    await expect(page.getByText("On server")).toBeVisible();
  });

  test("warns that JPEG output drops transparency", async ({ page }) => {
    await uploadImage(page, "logo.png", await transparentPng());
    await chooseOutputFormat(page, /JPEG/);
    await expect(page.getByText("JPEG cannot keep transparency")).toBeVisible();
    await page.getByRole("button", { name: "Use PNG" }).click();
    await expect(page.getByText("JPEG cannot keep transparency")).toBeHidden();
  });

  test("shows an accessible error for a fake image", async ({ page }) => {
    await uploadImage(page, "notes.png", Buffer.from("just some text"));
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/not a supported image/i);
    await expect(page.getByRole("button", { name: /convert to/i })).toBeDisabled();
  });

  test("compresses to a target size and reports the measured result", async ({ page }) => {
    const raw = Buffer.alloc(800 * 600 * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) % 256;
    const photo = await sharp(raw, { raw: { width: 800, height: 600, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    await uploadImage(page, "photo.jpg", photo, "image/jpeg");
    await page.getByRole("tab", { name: /compress/i }).click();
    await page.getByRole("radio", { name: "Strict size" }).click();
    await page.getByLabel("Target file size").click();
    await page.getByLabel("Target size", { exact: true }).fill(String(Math.round(photo.length / 1024 / 2)));
    await page.getByRole("button", { name: "Compress image" }).click();
    await expect(page.getByText(/Target reached|Strict size target could not be met/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/% smaller ·|larger than the original|Same size as the original/).first()).toBeVisible();
  });
});
