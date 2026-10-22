import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { imageLimits } from "@/config/limits";
import { POST as compressPost } from "@/app/api/image/compress/route";
import { POST as convertPost } from "@/app/api/image/convert/route";
import { defaultCompressOptions, defaultEncodeOptions } from "@/features/image/lib/schema";
import { compressImage, convertImage, readSourceMetadata } from "@/server/image/sharp-service";

let alphaPng: Buffer;
let photo: Buffer;
let animatedGif: Buffer;

/** Noisy RGB image: compresses poorly, so target-size search has real work to do. */
async function noisyPhoto(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 42;
  for (let i = 0; i < raw.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const x = (i / 3) % width;
    raw[i] = (Math.sin(x / 9) * 80 + 128 + (seed % 60)) & 255;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

beforeAll(async () => {
  alphaPng = await sharp({
    create: { width: 64, height: 48, channels: 4, background: { r: 200, g: 30, b: 90, alpha: 0.4 } },
  })
    .png()
    .toBuffer();
  photo = await noisyPhoto(640, 480);
  const frame = (r: number) =>
    sharp({ create: { width: 32, height: 32, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } }).raw().toBuffer();
  const frames = await Promise.all([frame(255), frame(0), frame(128)]);
  animatedGif = await sharp(Buffer.concat(frames), { raw: { width: 32, height: 96, channels: 4, pageHeight: 32 } })
    .gif({ loop: 0, delay: [100, 100, 100] })
    .toBuffer();
});

describe("sharp service: conversion", () => {
  it.each([
    ["webp", "webp"],
    ["avif", "heif"],
    ["tiff", "tiff"],
    ["png", "png"],
  ] as const)("converts PNG with alpha to %s and keeps transparency", async (format, sharpFormat) => {
    const result = await convertImage(alphaPng, { ...defaultEncodeOptions(format) });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe(sharpFormat);
    expect(meta.hasAlpha).toBe(true);
    expect(result).toMatchObject({ width: 64, height: 48, format });
  });

  it("flattens transparency onto the chosen background for JPEG", async () => {
    const result = await convertImage(alphaPng, { ...defaultEncodeOptions("jpeg"), background: "#00ff00" });
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.hasAlpha).toBe(false);
    const { data } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    // 40% magenta over green: the green channel must be strongly present.
    expect(data[1]).toBeGreaterThan(100);
  });

  it("resizes without upscaling and honours max edge", async () => {
    const result = await convertImage(photo, {
      ...defaultEncodeOptions("webp"),
      resize: { mode: "max", maxDimension: 320, keepAspect: true, allowUpscale: false },
    });
    expect([result.width, result.height]).toEqual([320, 240]);
  });

  it("preserves animation for WebP and requires consent for still formats", async () => {
    const source = await readSourceMetadata(animatedGif);
    expect(source.frames).toBe(3);
    const webp = await convertImage(animatedGif, defaultEncodeOptions("webp"));
    expect(webp.frames).toBe(3);
    expect((await sharp(webp.buffer, { animated: true }).metadata()).pages).toBe(3);
    await expect(convertImage(animatedGif, defaultEncodeOptions("png"))).rejects.toMatchObject({ code: "INVALID_SETTINGS" });
    const still = await convertImage(animatedGif, { ...defaultEncodeOptions("png"), firstFrameOnly: true });
    expect(still).toMatchObject({ frames: 1, width: 32, height: 32 });
  });

  it("rejects non-images, SVG and decompression bombs", async () => {
    await expect(readSourceMetadata(Buffer.from("definitely not an image"))).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(readSourceMetadata(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
    // A tiny PNG header claiming 20000 × 20000 pixels.
    const bomb = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
    bomb.writeUInt32BE(20_000, 16);
    bomb.writeUInt32BE(20_000, 20);
    await expect(readSourceMetadata(bomb)).rejects.toMatchObject({ code: "DIMENSIONS_TOO_LARGE" });
    const truncated = photo.subarray(0, 200);
    await expect(convertImage(truncated, defaultEncodeOptions("png"))).rejects.toHaveProperty("code");
  });
});

describe("sharp service: compression", () => {
  it("meets a feasible target with measured output", async () => {
    const target = Math.round(photo.length * 0.35);
    const result = await compressImage(photo, { ...defaultCompressOptions("jpeg"), mode: "strict", targetBytes: target });
    expect(result.targetMet).toBe(true);
    expect(result.size).toBeLessThanOrEqual(target);
    expect(result.buffer.length).toBe(result.size);
    expect(result.attempts).toBeLessThanOrEqual(imageLimits.maxQualitySteps);
  });

  it("reports an impossible strict target instead of claiming success", async () => {
    const result = await compressImage(photo, {
      ...defaultCompressOptions("jpeg"),
      mode: "strict",
      targetBytes: imageLimits.minTargetBytes,
      allowResize: false,
    });
    expect(result.targetMet).toBe(false);
    expect(result.explanation).toMatch(/above the/);
    expect(result.suggestion).toMatch(/Allow resizing/);
  });

  it("uses lossless encoding in lossless mode", async () => {
    const result = await compressImage(alphaPng, { ...defaultCompressOptions("webp"), mode: "lossless" });
    expect(result.lossless).toBe(true);
    expect(result.attempts).toBe(1);
    const { data: original } = await sharp(alphaPng).raw().toBuffer({ resolveWithObject: true });
    const { data: decoded } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(Buffer.compare(original, decoded)).toBe(0);
  });
});

function upload(endpoint: string, file: Blob | null, options: unknown, extraHeaders: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.set("file", file, "holiday photo.png");
  form.set("options", typeof options === "string" ? options : JSON.stringify(options));
  const request = new Request(`http://localhost/api/image/${endpoint}`, { method: "POST", body: form });
  if (Object.keys(extraHeaders).length === 0) return request;
  const headers = new Headers(request.headers);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Request(request, { headers });
}

describe("image API routes", () => {
  it("returns the converted image with metadata and no-store headers", async () => {
    const response = await convertPost(upload("convert", new Blob([new Uint8Array(alphaPng)]), defaultEncodeOptions("avif")));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/avif");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("holiday photo.avif");
    expect(response.headers.get("x-image-width")).toBe("64");
    const body = Buffer.from(await response.arrayBuffer());
    expect((await sharp(body).metadata()).format).toBe("heif");
  });

  it("rejects oversized declared bodies before reading them", async () => {
    const request = upload("convert", new Blob([new Uint8Array(alphaPng)]), defaultEncodeOptions("webp"), {
      "content-length": String(imageLimits.maxServerInputBytes * 2),
    });
    const response = await convertPost(request);
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("enforces the limit even when the body is larger than declared", async () => {
    const big = new Blob([new Uint8Array(imageLimits.maxServerInputBytes + 200_000)]);
    const response = await convertPost(upload("convert", big, defaultEncodeOptions("webp")));
    expect(response.status).toBe(413);
  });

  it("returns 415 for non-image bytes regardless of the file name", async () => {
    const response = await convertPost(upload("convert", new Blob(["hello"]), defaultEncodeOptions("webp")));
    expect(response.status).toBe(415);
    const json = await response.json();
    expect(json.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(JSON.stringify(json)).not.toMatch(/at \w+ \(|node_modules/);
  });

  it("returns 400 with the field for invalid options", async () => {
    const invalidJson = await convertPost(upload("convert", new Blob([new Uint8Array(alphaPng)]), "{not json"));
    expect(invalidJson.status).toBe(400);
    const badQuality = await convertPost(
      upload("convert", new Blob([new Uint8Array(alphaPng)]), { ...defaultEncodeOptions("webp"), quality: 500 }),
    );
    expect(badQuality.status).toBe(400);
    expect((await badQuality.json()).error.field).toBe("quality");
  });

  it("returns compression results with target headers", async () => {
    const target = Math.round(photo.length * 0.4);
    const response = await compressPost(
      upload("compress", new Blob([new Uint8Array(photo)]), {
        ...defaultCompressOptions("webp"),
        mode: "strict",
        targetBytes: target,
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-image-target-met")).toBe("true");
    expect(Number(response.headers.get("content-length"))).toBeLessThanOrEqual(target);
  });

  it("refuses to return outputs above the response cap", async () => {
    // Lossless TIFF of a large noisy image exceeds the 4.4 MB response cap.
    const raw = Buffer.alloc(1400 * 1400 * 3);
    for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 7919) % 251;
    const source = await sharp(raw, { raw: { width: 1400, height: 1400, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
    expect(source.length).toBeLessThan(imageLimits.maxServerInputBytes);
    const response = await convertPost(
      upload("convert", new Blob([new Uint8Array(source)]), { ...defaultEncodeOptions("tiff"), tiffCompression: "none" }),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("OUTPUT_TOO_LARGE");
  });
});
