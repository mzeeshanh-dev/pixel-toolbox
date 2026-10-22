import { describe, expect, it } from "vitest";
import { MB, imageLimits } from "@/config/limits";
import { chooseEngine, type EngineSource } from "@/features/image/lib/engine";
import { inspectGif, inspectPng, inspectWebp } from "@/features/image/lib/inspect";
import { optimizeToTarget, qualityFloors, type EncodeAttempt } from "@/features/image/lib/optimizer";
import { computeOutputDimensions } from "@/features/image/lib/resize";
import {
  compressOptionsSchema,
  convertOptionsSchema,
  defaultCompressOptions,
  defaultEncodeOptions,
  fieldErrors,
  usesQuality,
} from "@/features/image/lib/schema";

const bytes = (...parts: (number | string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : Array.isArray(part) ? part : [part],
    ),
  );
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function gif(frames: number) {
  const frame = [
    0x21, 0xf9, 4, 0x01, 0, 0, 0, 0, // graphic control (transparent flag)
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, // image descriptor, no local table
    2, 2, 0x4c, 0x01, 0, // LZW min size + one data sub-block + terminator
  ];
  return bytes("GIF89a", [1, 0, 1, 0, 0x80, 0, 0], [0, 0, 0, 255, 255, 255], ...Array(frames).fill(frame), 0x3b);
}

function png(options: { animatedFrames?: number; colorType?: number }) {
  const ihdr = bytes(u32be(13), "IHDR", u32be(4), u32be(3), 8, options.colorType ?? 2, 0, 0, 0, u32be(0));
  const actl = options.animatedFrames
    ? bytes(u32be(8), "acTL", u32be(options.animatedFrames), u32be(0), u32be(0))
    : bytes();
  return bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [...ihdr], [...actl], u32be(0), "IDAT", u32be(0));
}

function webpVp8x(animated: boolean, frames: number) {
  const flags = (animated ? 0x02 : 0) | 0x10;
  const anmf = bytes("ANMF", u32le(2), 0, 0);
  return bytes(
    "RIFF", u32le(0), "WEBP", "VP8X", u32le(10), flags, 0, 0, 0, [99, 0, 0], [49, 0, 0],
    "ANIM", u32le(6), 0, 0, 0, 0, 0, 0,
    ...Array(frames).fill([...anmf]),
  );
}

describe("animation and header inspection", () => {
  it("counts GIF frames from the block structure", () => {
    expect(inspectGif(gif(1))).toMatchObject({ animated: false, frames: 1, width: 1, height: 1, alpha: true });
    expect(inspectGif(gif(3))).toMatchObject({ animated: true, frames: 3 });
  });

  it("detects APNG via acTL and alpha via colour type", () => {
    expect(inspectPng(png({}))).toMatchObject({ animated: false, width: 4, height: 3, alpha: false });
    expect(inspectPng(png({ animatedFrames: 5 }))).toMatchObject({ animated: true, frames: 5 });
    expect(inspectPng(png({ colorType: 6 })).alpha).toBe(true);
  });

  it("detects animated WebP via the VP8X flag", () => {
    expect(inspectWebp(webpVp8x(true, 4))).toMatchObject({ animated: true, frames: 4, width: 100, height: 50, alpha: true });
    expect(inspectWebp(webpVp8x(false, 0))).toMatchObject({ animated: false, frames: 1 });
  });
});

const caps = { browserEncodes: ["jpeg", "png", "webp"] as const };
const still = (overrides: Partial<EngineSource> = {}): EngineSource => ({
  format: "png",
  bytes: 1 * MB,
  animated: false,
  browserCanDecode: true,
  ...overrides,
});
const convert = (format: Parameters<typeof defaultEncodeOptions>[0], patch = {}) =>
  ({ type: "convert", options: { ...defaultEncodeOptions(format), ...patch } }) as const;

describe("chooseEngine", () => {
  it("keeps JPEG, PNG and WebP conversion in the browser", () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      expect(chooseEngine(still(), convert(format), caps)).toMatchObject({ kind: "ready", engine: "browser" });
    }
  });

  it("sends AVIF and TIFF output to the server", () => {
    expect(chooseEngine(still(), convert("avif"), caps)).toMatchObject({ kind: "ready", engine: "server" });
    expect(chooseEngine(still(), convert("tiff"), caps)).toMatchObject({ kind: "ready", engine: "server" });
  });

  it("reports server-only work on files above the serverless limit as unavailable", () => {
    const decision = chooseEngine(still({ bytes: imageLimits.maxServerInputBytes + 1 }), convert("avif"), caps);
    expect(decision).toMatchObject({ kind: "unavailable", code: "FILE_TOO_LARGE" });
    expect(decision.kind === "unavailable" && decision.message).toMatch(/up to 4 MB/);
    // ...but a large file can still be converted to WebP locally.
    expect(chooseEngine(still({ bytes: 30 * MB }), convert("webp"), caps)).toMatchObject({ engine: "browser" });
  });

  it("uses the server for undecodable input and when the browser cannot encode the format", () => {
    expect(chooseEngine(still({ format: "tiff", browserCanDecode: false }), convert("png"), caps)).toMatchObject({
      engine: "server",
    });
    expect(chooseEngine(still(), convert("webp"), { browserEncodes: ["jpeg", "png"] })).toMatchObject({
      engine: "server",
    });
    expect(chooseEngine(still({ format: "bmp" }), convert("avif"), caps)).toMatchObject({
      kind: "unavailable",
      code: "UNSUPPORTED_FORMAT",
    });
  });

  it("requires explicit consent before flattening an animation", () => {
    const animated = still({ format: "gif", animated: true });
    expect(chooseEngine(animated, convert("jpeg"), caps).kind).toBe("needs-consent");
    expect(chooseEngine(animated, convert("jpeg", { firstFrameOnly: true }), caps)).toMatchObject({ engine: "browser" });
    expect(chooseEngine(animated, convert("webp"), caps)).toMatchObject({ engine: "server", preservesAnimation: true });
  });

  it("routes advanced encoder options to Sharp", () => {
    expect(chooseEngine(still(), convert("jpeg", { chromaSubsampling: "4:4:4" }), caps)).toMatchObject({ engine: "server" });
    expect(chooseEngine(still(), convert("webp", { webpLossless: true }), caps)).toMatchObject({ engine: "server" });
    const compressPng = { type: "compress", options: { ...defaultCompressOptions("png") } } as const;
    expect(chooseEngine(still(), compressPng, caps)).toMatchObject({ engine: "server" });
  });
});

describe("option schemas", () => {
  it("accepts defaults and rejects out-of-range values", () => {
    expect(convertOptionsSchema.safeParse(defaultEncodeOptions()).success).toBe(true);
    const bad = convertOptionsSchema.safeParse({ ...defaultEncodeOptions(), quality: 0, background: "red" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(Object.keys(fieldErrors(bad.error))).toEqual(expect.arrayContaining(["quality", "background"]));
    const resize = convertOptionsSchema.safeParse({
      ...defaultEncodeOptions(),
      resize: { mode: "max", keepAspect: true, allowUpscale: false, maxDimension: 99_999 },
    });
    expect(resize.success).toBe(false);
  });

  it("validates compression rules", () => {
    expect(compressOptionsSchema.safeParse({ ...defaultCompressOptions(), targetBytes: 100 }).success).toBe(false);
    expect(compressOptionsSchema.safeParse({ ...defaultCompressOptions("jpeg"), mode: "lossless" }).success).toBe(false);
    expect(compressOptionsSchema.safeParse({ ...defaultCompressOptions(), targetBytes: 200_000 }).success).toBe(true);
  });

  it("only uses quality for lossy settings", () => {
    expect(usesQuality(defaultEncodeOptions("png"))).toBe(false);
    expect(usesQuality({ ...defaultEncodeOptions("png"), pngPalette: true })).toBe(true);
    expect(usesQuality({ ...defaultEncodeOptions("webp"), webpLossless: true })).toBe(false);
    expect(usesQuality(defaultEncodeOptions("jpeg"))).toBe(true);
  });
});

describe("computeOutputDimensions", () => {
  const source = { width: 4000, height: 2000 };
  it("never upscales unless allowed and keeps aspect ratio", () => {
    expect(computeOutputDimensions(source, { mode: "max", maxDimension: 1000, keepAspect: true, allowUpscale: false })).toEqual({ width: 1000, height: 500 });
    expect(computeOutputDimensions(source, { mode: "max", maxDimension: 8000, keepAspect: true, allowUpscale: false })).toEqual(source);
    expect(computeOutputDimensions(source, { mode: "exact", width: 800, keepAspect: true, allowUpscale: false })).toEqual({ width: 800, height: 400 });
    expect(computeOutputDimensions(source, { mode: "exact", width: 800, height: 800, keepAspect: false, allowUpscale: false })).toEqual({ width: 800, height: 800 });
    expect(computeOutputDimensions(source, { mode: "none", keepAspect: true, allowUpscale: false }, 0.5)).toEqual({ width: 2000, height: 1000 });
  });
});

/** Fake encoder: size grows with quality and with area (monotonic, deterministic). */
function fakeEncoder(baseBytes: number) {
  const calls: EncodeAttempt[] = [];
  const encode = async (attempt: EncodeAttempt) => {
    calls.push(attempt);
    return { size: Math.round(baseBytes * (0.1 + attempt.quality / 100) * attempt.scale * attempt.scale) };
  };
  return { encode, calls };
}

describe("optimizeToTarget", () => {
  const base = { originalBytes: 1_000_000, preferredQuality: 90, allowResize: false, lossless: false } as const;

  it("returns the first encode when it already fits", async () => {
    const { encode, calls } = fakeEncoder(500_000);
    const result = await optimizeToTarget({ ...base, encode, mode: "quality", targetBytes: 900_000 });
    expect(result).toMatchObject({ targetMet: true, attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("finds the highest quality that meets the target", async () => {
    const { encode } = fakeEncoder(1_000_000);
    const target = 700_000; // fits at quality <= 60
    const result = await optimizeToTarget({ ...base, encode, mode: "strict", targetBytes: target });
    expect(result.targetMet).toBe(true);
    expect(result.best.size).toBeLessThanOrEqual(target);
    expect(result.best.quality).toBe(60);
    expect(result.attempts).toBeLessThanOrEqual(imageLimits.maxQualitySteps);
  });

  it("respects the quality-priority floor and reports a miss honestly", async () => {
    const { encode, calls } = fakeEncoder(1_000_000);
    const result = await optimizeToTarget({ ...base, encode, mode: "quality", targetBytes: 300_000 });
    expect(result.targetMet).toBe(false);
    expect(Math.min(...calls.map((c) => c.quality))).toBe(qualityFloors.quality);
    expect(result.explanation).toMatch(/quality below 70/);
    expect(result.suggestion).toMatch(/Strict Size Target/);
  });

  it("resizes in strict mode only when allowed", async () => {
    const target = 150_000;
    const noResize = fakeEncoder(1_000_000);
    const strictNoResize = await optimizeToTarget({ ...base, encode: noResize.encode, mode: "strict", targetBytes: target });
    expect(strictNoResize.targetMet).toBe(false);
    expect(noResize.calls.every((c) => c.scale === 1)).toBe(true);
    expect(strictNoResize.suggestion).toMatch(/Allow resizing/);

    const withResize = fakeEncoder(1_000_000);
    const resized = await optimizeToTarget({ ...base, encode: withResize.encode, mode: "strict", targetBytes: target, allowResize: true });
    expect(resized.targetMet).toBe(true);
    expect(resized.best.scale).toBeLessThan(1);
    expect(resized.best.size).toBeLessThanOrEqual(target);
    expect(resized.attempts).toBeLessThanOrEqual(imageLimits.maxQualitySteps + imageLimits.maxResizeSteps * 3);
  });

  it("stops within the attempt budget for impossible targets", async () => {
    const { encode, calls } = fakeEncoder(1_000_000);
    const result = await optimizeToTarget({ ...base, encode, mode: "strict", targetBytes: 1_000, allowResize: true });
    expect(result.targetMet).toBe(false);
    expect(calls.length).toBeLessThanOrEqual(imageLimits.maxQualitySteps + imageLimits.maxResizeSteps * 3);
    expect(result.best.size).toBe(Math.min(...(await Promise.all(calls.map(async (c) => (await encode(c)).size)))));
  });

  it("never lowers quality or resizes in lossless mode", async () => {
    const { encode, calls } = fakeEncoder(1_000_000);
    const result = await optimizeToTarget({ ...base, encode, mode: "lossless", lossless: true, allowResize: true, targetBytes: 10_000 });
    expect(calls).toEqual([{ quality: 100, scale: 1 }]);
    expect(result.targetMet).toBe(false);
    expect(result.explanation).toMatch(/never discards/);
  });

  it("flags results that are not smaller than the original", async () => {
    const { encode } = fakeEncoder(2_000_000);
    const result = await optimizeToTarget({ ...base, encode, mode: "quality", targetBytes: null });
    expect(result.largerThanOriginal).toBe(true);
    expect(result.explanation).toMatch(/already well optimised/);
  });

  it("can be cancelled between attempts", async () => {
    const controller = new AbortController();
    const { encode } = fakeEncoder(1_000_000);
    const run = optimizeToTarget({
      ...base,
      mode: "strict",
      targetBytes: 300_000,
      signal: controller.signal,
      encode: async (attempt) => {
        controller.abort();
        return encode(attempt);
      },
    });
    await expect(run).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
