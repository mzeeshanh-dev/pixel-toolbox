import { describe, expect, it, vi } from "vitest";
import { MB, videoLimits, videoProcessingBudgetMs } from "@/config/limits";
import { convertToGif } from "@/features/video/lib/convert";
import { FFmpegEngine, type FFmpegLike } from "@/features/video/lib/ffmpeg-engine";
import { validateMetadata, type VideoMetadata } from "@/features/video/lib/probe";
import { defaultEnd, defaultSettings, outputLoad, validateSettings } from "@/features/video/lib/settings";
import { AppError } from "@/lib/errors";
import { formatDuration } from "@/lib/format";

const eightMinutes = { duration: 8 * 60, width: 1920, height: 1080 };

function gifBytes() {
  const bytes = new Uint8Array(64);
  bytes.set([..."GIF89a"].map((char) => char.charCodeAt(0)));
  bytes.set([64, 0, 36, 0], 6);
  return bytes;
}

/** Minimal fake FFmpeg; `mountSupported` toggles WORKERFS availability. */
function fakeFFmpeg(mountSupported: boolean) {
  const files = new Map<string, Uint8Array>();
  const calls = { mount: [] as unknown[], unmount: [] as string[], writeFile: [] as string[], deleteDir: [] as string[], exec: [] as string[][] };
  const fake = {
    loaded: false,
    calls,
    load: async () => {
      fake.loaded = true;
      return true;
    },
    on: () => undefined,
    off: () => undefined,
    createDir: async () => true,
    deleteDir: async (path: string) => {
      calls.deleteDir.push(path);
      return true;
    },
    mount: async (...args: unknown[]) => {
      calls.mount.push(args);
      return mountSupported;
    },
    unmount: async (path: string) => {
      calls.unmount.push(path);
      return true;
    },
    writeFile: async (path: string, data: Uint8Array) => {
      calls.writeFile.push(path);
      files.set(path, data);
      return true;
    },
    readFile: async (path: string) => files.get(path)!,
    deleteFile: async (path: string) => {
      files.delete(path);
      return true;
    },
    exec: async (args: string[]) => {
      calls.exec.push(args);
      const output = args.at(-1)!;
      files.set(output, output.endsWith(".gif") ? gifBytes() : new Uint8Array([1]));
      return 0;
    },
    terminate: () => undefined,
  };
  return fake;
}

describe("long video support", () => {
  it("accepts sources up to one hour and explains the limit in plain words", () => {
    expect(videoLimits.maxDurationSeconds).toBe(3600);
    expect(() => validateMetadata(eightMinutes)).not.toThrow();
    expect(() => validateMetadata({ ...eightMinutes, duration: 59 * 60 })).not.toThrow();
    try {
      validateMetadata({ ...eightMinutes, duration: 61 * 60 });
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as AppError).code).toBe("DURATION_TOO_LONG");
      expect((error as AppError).message).toContain("The current limit is 1 hour");
    }
  });

  it("formats long durations naturally", () => {
    expect(formatDuration(135)).toBe("2:15 min");
    expect(formatDuration(480)).toBe("8 min");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(3725)).toBe("1:02:05 h");
  });

  it("lets a full 8-minute video be converted with the default Balanced settings", () => {
    const settings = defaultSettings(eightMinutes.width);
    expect(defaultEnd(settings, eightMinutes)).toBeNull();
    const result = validateSettings({ ...settings, end: null }, eightMinutes);
    expect(result.ok).toBe(true);
    expect(outputLoad(settings, eightMinutes).frames).toBe(8 * 60 * settings.fps);
  });

  it("pre-trims sources that are too long for one GIF and rejects oversized clips with guidance", () => {
    const hour = { ...eightMinutes, duration: 3600 };
    const settings = defaultSettings(hour.width);
    const end = defaultEnd(settings, hour);
    expect(end).not.toBeNull();
    expect(outputLoad({ ...settings, start: 0, end }, hour).frames).toBeLessThanOrEqual(videoLimits.maxOutputFrames);
    const tooLong = validateSettings({ ...settings, end: null }, hour);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.errors.end).toMatch(/frame/);
  });

  it("scales the processing budget with clip length, within bounds", () => {
    expect(videoProcessingBudgetMs(5)).toBe(videoLimits.processingBudgetMs);
    expect(videoProcessingBudgetMs(8 * 60)).toBe(8 * 60 * videoLimits.budgetMsPerClipSecond);
    expect(videoProcessingBudgetMs(10 * 3600)).toBe(videoLimits.maxProcessingBudgetMs);
  });
});

describe("source mounting", () => {
  const meta: VideoMetadata = { duration: 4, width: 640, height: 360, container: "mp4", previewable: true };
  const settings = { ...defaultSettings(640), targetMB: null };

  function engineFor(fake: ReturnType<typeof fakeFFmpeg>) {
    vi.stubGlobal("Worker", class {});
    return new FFmpegEngine(async () => fake as unknown as FFmpegLike, () => ({ coreURL: "c.js", wasmURL: "c.wasm" }));
  }

  it("mounts the source read-only instead of copying it into memory, then unmounts", async () => {
    const fake = fakeFFmpeg(true);
    const file = new Blob([new Uint8Array(2048)]);
    const result = await convertToGif({ engine: engineFor(fake), file, meta, settings });
    expect(result.blob.type).toBe("image/gif");
    expect(fake.calls.mount).toHaveLength(1);
    expect(fake.calls.writeFile).not.toContain("input.mp4");
    expect(fake.calls.exec[0]).toContain("/source/input.mp4");
    expect(fake.calls.unmount).toEqual(["/source"]);
  });

  it("falls back to copying small files when the browser cannot mount", async () => {
    const fake = fakeFFmpeg(false);
    const file = new Blob([new Uint8Array(2048)]);
    await convertToGif({ engine: engineFor(fake), file, meta, settings });
    expect(fake.calls.writeFile).toContain("input.mp4");
    expect(fake.calls.exec[0]).toContain("input.mp4");
  });

  it("refuses to copy huge files into memory when mounting is unavailable", async () => {
    const fake = fakeFFmpeg(false);
    const huge = { size: videoLimits.maxCopiedInputBytes + MB, arrayBuffer: async () => new ArrayBuffer(0) } as Blob;
    await expect(convertToGif({ engine: engineFor(fake), file: huge, meta, settings })).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    expect(fake.calls.writeFile).not.toContain("input.mp4");
  });
});
