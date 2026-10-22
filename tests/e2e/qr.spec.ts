import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.describe("QR generator", () => {
  test("exports a truly transparent PNG, persists saves and keeps version history", async ({ page }) => {
    await page.goto("/qr-generator");

    await page.getByLabel("Website URL").fill("https://example.com/e2e");
    await page.getByLabel("Name", { exact: true }).fill("E2E code");
    await page.getByRole("switch", { name: "Transparent background" }).click();
    await expect(page.getByAltText("QR code preview for https://example.com/e2e")).toBeVisible();

    // Download the PNG and inspect real pixels.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "PNG", exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("E2E code.png");
    const png = await readFile((await download.path())!);
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const pixels = await page.evaluate(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const corner = context.getImageData(0, 0, 1, 1).data;
      const all = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let opaque = 0;
      for (let i = 3; i < all.length; i += 4) if (all[i] === 255) opaque += 1;
      return { width: bitmap.width, cornerAlpha: corner[3], opaque };
    }, png.toString("base64"));
    expect(pixels.width).toBeGreaterThan(900);
    expect(pixels.cornerAlpha).toBe(0);
    expect(pixels.opaque).toBeGreaterThan(0);

    // Save, reload and confirm persistence.
    await page.getByRole("button", { name: /save to library/i }).click();
    await expect(page.getByText("Saved “E2E code” to your library.")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: /library/i }).click();
    const card = page.getByRole("button", { name: "E2E code", exact: true });
    await expect(card).toBeVisible();

    // Edit → new version.
    await card.click();
    await expect(page.getByText(/Editing/)).toBeVisible();
    await page.getByLabel("Website URL").fill("https://example.com/e2e-v2");
    await page.getByRole("button", { name: /save as new version/i }).click();
    await expect(page.getByText("Saved “E2E code” as version 2.")).toBeVisible();

    // History shows both versions.
    await page.getByRole("tab", { name: /library/i }).click();
    await page.getByRole("button", { name: "Actions for E2E code" }).click();
    await page.getByRole("menuitem", { name: "Version history" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Version 2")).toBeVisible();
    await expect(dialog.getByText("Version 1")).toBeVisible();

    // Restoring v1 appends v3 instead of rewriting history.
    await dialog.getByText("Version 1").click();
    await dialog.getByRole("button", { name: "Restore v1" }).click();
    await expect(dialog.getByText("Version 3")).toBeVisible();
    await expect(dialog.getByText("restored from v1")).toBeVisible();
  });
});
