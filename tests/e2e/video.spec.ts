import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ffmpegAssets } from "../../src/config/ffmpeg";

test.describe("Video to GIF", () => {
  test("serves the FFmpeg runtime from the production build", async ({ request }) => {
    const wasm = await request.get(ffmpegAssets.wasm);
    expect(wasm.status()).toBe(200);
    expect(wasm.headers()["content-type"]).toContain("application/wasm");

    for (const path of [ffmpegAssets.core, ffmpegAssets.module, ffmpegAssets.module.replace("index.js", "worker.js")]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toMatch(/javascript/);
    }
  });

  test("converts a real WebM clip into a downloadable GIF", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/video-to-gif");

    // Record a 2-second 160×120 WebM in the browser so no binary fixture is needed.
    const clip = await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 120;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(15);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start(100);
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const draw = () => {
          const t = (performance.now() - started) / 1000;
          context.fillStyle = `hsl(${(t * 180) % 360} 70% 50%)`;
          context.fillRect(0, 0, 160, 120);
          context.fillStyle = "#fff";
          context.fillRect(20 + t * 50, 40, 30, 30);
          if (t < 2) requestAnimationFrame(draw);
          else resolve();
        };
        draw();
      });
      recorder.stop();
      await stopped;
      const buffer = await new Blob(chunks, { type: "video/webm" }).arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    });

    await page.getByLabel("Choose video file").setInputFiles({
      name: "clip.webm",
      mimeType: "video/webm",
      buffer: Buffer.from(clip),
    });

    const convert = page.getByRole("button", { name: "Convert to GIF" });
    await expect(convert).toBeEnabled({ timeout: 60_000 });
    await convert.click();

    const download = page.getByRole("button", { name: /Download GIF/ });
    await expect(download).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("img", { name: /Animated GIF converted from clip\.webm/ })).toBeVisible();

    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    expect(file.suggestedFilename()).toBe("clip.gif");
    const bytes = await readFile((await file.path())!);
    expect(bytes.subarray(0, 6).toString("ascii")).toBe("GIF89a");
  });

  test("rejects a non-video file with a clear message", async ({ page }) => {
    await page.goto("/video-to-gif");
    await page.getByLabel("Choose video file").setInputFiles({
      name: "notes.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("These are plain text notes, not a video."),
    });
    const alert = page.getByRole("alert").filter({ hasText: "not a recognised video format" });
    await expect(alert).toBeVisible();
    await expect(page.getByRole("button", { name: "Convert to GIF" })).toHaveCount(0);
  });
});
