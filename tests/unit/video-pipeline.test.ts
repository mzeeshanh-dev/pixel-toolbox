import { formatBytes } from "@/lib/format";
import { describe, expect, it } from "vitest";
import { MB, videoLimits } from "@/config/limits";
import { encodeArgs, paletteArgs } from "@/features/video/lib/ffmpeg-args";
import { countGifFrames, gifDimensions, isGif } from "@/features/video/lib/gif";
import { floors, pickBest, planNext, type AttemptRecord } from "@/features/video/lib/optimizer";
import { parseLogTime, parseProbeLog, validateFileBasics, validateMetadata } from "@/features/video/lib/probe";
import {
  defaultSettings,
  initialEncodeParams,
  qualityProfiles,
  validateSettings,
  type EncodeParams,
} from "@/features/video/lib/settings";
import { AppError } from "@/lib/errors";

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const mp4Header = new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypisom"), 0, 0, 0, 0, ...ascii("isomiso2")]);
const pngHeader = new Uint8Array([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function expectCode(fn: () => unknown, code: AppError["code"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Expected ${code}`);
}

describe("video input validation", () => {
  it("rejects files over the size limit with the configured limit in the message", () => {
    const error = expectCode(() => validateFileBasics({ size: videoLimits.maxInputBytes + 1 }, mp4Header), "FILE_TOO_LARGE");
    expect(error.message).toBe(`The selected video exceeds the current ${formatBytes(videoLimits.maxInputBytes, 0)} limit.`);
  });

  it("detects the container from bytes rather than the extension", () => {
    expect(validateFileBasics({ size: 1000 }, mp4Header)).toBe("mp4");
    // A PNG renamed to .mp4 is still a PNG.
    expectCode(() => validateFileBasics({ size: 1000 }, pngHeader), "UNSUPPORTED_FORMAT");
    expectCode(() => validateFileBasics({ size: 1000 }, new Uint8Array(ascii("just some text, not a video"))), "UNSUPPORTED_FORMAT");
    expectCode(() => validateFileBasics({ size: 0 }, mp4Header), "INVALID_FILE");
  });

  it("enforces duration, dimension and decodability limits", () => {
    expect(() => validateMetadata({ duration: 12, width: 1920, height: 1080 })).not.toThrow();
    expectCode(() => validateMetadata({ duration: videoLimits.maxDurationSeconds + 5, width: 640, height: 360 }), "DURATION_TOO_LONG");
    expectCode(() => validateMetadata({ duration: 5, width: 7680, height: 4320 }), "DIMENSIONS_TOO_LARGE");
    expectCode(() => validateMetadata({ duration: Number.NaN, width: 640, height: 360 }), "DECODE_FAILED");
    expectCode(() => validateMetadata({ duration: 5, width: 0, height: 0 }), "DECODE_FAILED");
  });
});

describe("ffmpeg log parsing", () => {
  it("extracts duration and the first video stream", () => {
    const parsed = parseProbeLog([
      "Input #0, matroska,webm, from 'input.mkv':",
      "  Duration: 00:00:12.48, start: 0.000000, bitrate: 1200 kb/s",
      "  Stream #0:0(eng): Audio: aac (LC), 48000 Hz, stereo, fltp",
      "  Stream #0:1(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 30 fps",
    ]);
    expect(parsed.duration).toBeCloseTo(12.48);
    expect(parsed.video).toEqual({ codec: "h264", width: 1920, height: 1080 });
  });

  it("reports missing video streams and unknown durations", () => {
    const parsed = parseProbeLog(["  Duration: N/A, bitrate: N/A", "  Stream #0:0: Audio: opus, 48000 Hz, stereo"]);
    expect(parsed.duration).toBeNull();
    expect(parsed.video).toBeNull();
  });

  it("parses progress time stamps", () => {
    expect(parseLogTime("frame=  42 fps= 12 q=-0.0 size=  512kB time=00:01:02.50 bitrate=")).toBeCloseTo(62.5);
    expect(parseLogTime("no time here")).toBeNull();
  });
});

describe("ffmpeg argument builder", () => {
  const params = initialEncodeParams({ ...defaultSettings(1920), fps: 15, width: 480, quality: "high" });
  const clip = { start: 1.5, duration: 4 };

  it("uses palettegen then paletteuse with Lanczos scaling and even height", () => {
    const palette = paletteArgs("input.mp4", "palette.png", clip, params).join(" ");
    expect(palette).toContain("-ss 1.500 -t 4.000 -i input.mp4");
    expect(palette).toContain("fps=15,scale=480:-2:flags=lanczos,palettegen=stats_mode=full:max_colors=256");
    const encode = encodeArgs("input.mp4", "palette.png", "out.gif", clip, params).join(" ");
    expect(encode).toContain("[x][1:v]paletteuse=dither=sierra2_4a");
    expect(encode).toContain("-loop 0");
    expect(encode).toMatch(/out\.gif$/);
  });

  it("maps each quality preference to genuinely different encoder settings", () => {
    const build = (quality: "high" | "balanced" | "small") =>
      encodeArgs("i", "p", "o", clip, initialEncodeParams({ ...defaultSettings(1920), quality })).join(" ") +
      paletteArgs("i", "p", clip, initialEncodeParams({ ...defaultSettings(1920), quality })).join(" ");
    const outputs = new Set([build("high"), build("balanced"), build("small")]);
    expect(outputs.size).toBe(3);
    expect(build("small")).toContain("max_colors=128");
    expect(build("balanced")).toContain("bayer_scale=3");
    expect(qualityProfiles.small.maxColors).toBeLessThan(qualityProfiles.high.maxColors);
  });

  it("forces even explicit dimensions", () => {
    const explicit = initialEncodeParams({ ...defaultSettings(1920), width: 481, keepAspect: false, height: 271 });
    expect(explicit.width % 2).toBe(0);
    expect(explicit.height! % 2).toBe(0);
    expect(paletteArgs("i", "p", clip, explicit).join(" ")).toContain(`scale=${explicit.width}:${explicit.height}`);
  });
});

describe("settings validation", () => {
  const source = { duration: 10, width: 1280, height: 720 };
  it("accepts defaults and rejects out-of-range values beside their fields", () => {
    expect(validateSettings(defaultSettings(1280), source).ok).toBe(true);
    const result = validateSettings({ ...defaultSettings(1280), width: 4000, fps: 60, targetMB: 0, start: 9.95 }, source);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.width).toMatch(/cannot exceed/);
      expect(result.errors.fps).toMatch(/cannot exceed/);
      expect(result.errors.targetMB).toMatch(/at least/);
      expect(result.errors.end).toMatch(/at least/);
    }
    const nan = validateSettings({ ...defaultSettings(1280), width: Number.NaN }, source);
    expect(nan.ok).toBe(false);
  });
});

describe("target-size optimizer", () => {
  const initial: EncodeParams = { fps: 20, width: 640, height: null, maxColors: 256, dither: "sierra2_4a", statsMode: "full" };
  const attempt = (params: EncodeParams, bytes: number): AttemptRecord => ({ params, bytes, durationMs: 1000 });
  const target = 2 * MB;

  it("encodes once with the initial settings and stops without a target", () => {
    const first = planNext({ initial, attempts: [], targetBytes: null, mode: "quality", elapsedMs: 0 });
    expect(first).toEqual({ action: "retry", params: initial, reason: "Initial encode" });
    expect(planNext({ initial, attempts: [attempt(initial, 9 * MB)], targetBytes: null, mode: "quality", elapsedMs: 0 })).toEqual({
      action: "stop",
      reason: "no-target",
    });
  });

  it("stops as soon as the target is met", () => {
    expect(planNext({ initial, attempts: [attempt(initial, target - 1)], targetBytes: target, mode: "quality", elapsedMs: 0 }).action).toBe("stop");
  });

  it("reduces frame rate before width for small overshoots", () => {
    const decision = planNext({ initial, attempts: [attempt(initial, target * 1.15)], targetBytes: target, mode: "quality", elapsedMs: 0 });
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.params.fps).toBeLessThan(20);
      expect(decision.params.width).toBe(640);
      expect(decision.params.maxColors).toBe(256);
    }
  });

  it("reduces gradually, combining fps and width for large overshoots", () => {
    const decision = planNext({ initial, attempts: [attempt(initial, target * 5)], targetBytes: target, mode: "quality", elapsedMs: 0 });
    if (decision.action !== "retry") throw new Error("expected retry");
    expect(decision.params.fps).toBeGreaterThanOrEqual(Math.round(20 * 0.67));
    expect(decision.params.width).toBeGreaterThanOrEqual(640 * 0.75);
    expect(decision.params.width).toBeLessThan(640);
    expect(decision.params.width % 2).toBe(0);
  });

  it("respects quality-mode floors and never changes colours in Quality Priority", () => {
    const atFloor: EncodeParams = { ...initial, fps: floors.quality.fps, width: floors.quality.width };
    expect(planNext({ initial, attempts: [attempt(atFloor, target * 3)], targetBytes: target, mode: "quality", elapsedMs: 0 })).toEqual({
      action: "stop",
      reason: "floors-reached",
    });
  });

  it("only touches colours in strict mode after fps and width reach their floors", () => {
    const atFloor: EncodeParams = { ...initial, fps: floors.strict.fps, width: floors.strict.width };
    const decision = planNext({ initial, attempts: [attempt(atFloor, target * 3)], targetBytes: target, mode: "strict", elapsedMs: 0 });
    if (decision.action !== "retry") throw new Error("expected retry");
    expect(decision.params.maxColors).toBe(128);
    expect(decision.params.fps).toBe(floors.strict.fps);
    const notAtFloor = planNext({ initial, attempts: [attempt(initial, target * 3)], targetBytes: target, mode: "strict", elapsedMs: 0 });
    if (notAtFloor.action !== "retry") throw new Error("expected retry");
    expect(notAtFloor.params.maxColors).toBe(256);
  });

  it("stops at the attempt limit and the time budget", () => {
    const many = Array.from({ length: videoLimits.maxAttempts }, () => attempt(initial, target * 2));
    expect(planNext({ initial, attempts: many, targetBytes: target, mode: "strict", elapsedMs: 0 })).toEqual({ action: "stop", reason: "max-attempts" });
    expect(
      planNext({ initial, attempts: [attempt(initial, target * 2)], targetBytes: target, mode: "strict", elapsedMs: videoLimits.processingBudgetMs }),
    ).toEqual({ action: "stop", reason: "budget" });
  });

  it("is deterministic and converges within the attempt limit on a simulated encoder", () => {
    // Simulated size model: bytes ∝ fps × width².
    const simulate = (params: EncodeParams) => params.fps * params.width * params.width * 1.6;
    const run = () => {
      const attempts: AttemptRecord[] = [];
      for (;;) {
        const decision = planNext({ initial, attempts, targetBytes: target, mode: "quality", elapsedMs: 0 });
        if (decision.action === "stop") return { attempts, reason: decision.reason };
        attempts.push(attempt(decision.params, simulate(decision.params)));
      }
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.reason).toBe("target-met");
    expect(first.attempts.length).toBeLessThanOrEqual(videoLimits.maxAttempts);
  });

  it("picks the highest-quality result that meets the target, else the smallest", () => {
    const attempts = [attempt(initial, 5 * MB), attempt(initial, 1.9 * MB), attempt(initial, 1.2 * MB)];
    expect(pickBest(attempts, target)).toEqual({ index: 1, meetsTarget: true });
    expect(pickBest([attempt(initial, 5 * MB), attempt(initial, 3 * MB)], target)).toEqual({ index: 1, meetsTarget: false });
  });
});

describe("GIF output verification", () => {
  // 1×1 two-frame GIF built by hand.
  const frame = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
  const gif = new Uint8Array([
    ...ascii("GIF89a"),
    1, 0, 1, 0, 0x80, 0, 0,
    0, 0, 0, 255, 255, 255,
    ...frame,
    ...frame,
    0x3b,
  ]);

  it("recognises GIF magic bytes and rejects other data", () => {
    expect(isGif(gif)).toBe(true);
    expect(isGif(new Uint8Array(ascii("<html>not a gif</html>")))).toBe(false);
  });

  it("reads dimensions and counts frames", () => {
    expect(gifDimensions(gif)).toEqual({ width: 1, height: 1 });
    expect(countGifFrames(gif)).toBe(2);
    expect(countGifFrames(gif.subarray(0, gif.length - 5))).toBeNull();
  });
});
