import { describe, expect, it, vi } from "vitest";
import { MB } from "@/config/limits";
import { convertToGif } from "@/features/video/lib/convert";
import { FFmpegEngine, type FFmpegLike } from "@/features/video/lib/ffmpeg-engine";
import type { VideoMetadata } from "@/features/video/lib/probe";
import { defaultSettings } from "@/features/video/lib/settings";
import { AppError } from "@/lib/errors";

type Listener = (event: { type?: string; message?: string; progress?: number; time?: number }) => void;

const GIF_BYTES = (size: number) => {
  const bytes = new Uint8Array(Math.max(size, 20));
  bytes.set([..."GIF89a"].map((char) => char.charCodeAt(0)));
  bytes.set([64, 0, 36, 0], 6);
  return bytes;
};

/** In-memory stand-in for the FFmpeg worker. `sizeFor` decides each output's size. */
function createFakeFFmpeg(options: { sizeFor?: (args: string[]) => number; hang?: boolean; output?: Uint8Array } = {}) {
  const files = new Map<string, Uint8Array>();
  const listeners: Record<string, Set<Listener>> = { log: new Set(), progress: new Set() };
  let rejectHang: ((error: Error) => void) | null = null;
  const fake = {
    loaded: false,
    files,
    execCalls: [] as string[][],
    deleted: [] as string[],
    terminated: 0,
    load: vi.fn(async () => {
      fake.loaded = true;
      return true;
    }),
    on: (event: string, listener: Listener) => listeners[event].add(listener),
    off: (event: string, listener: Listener) => listeners[event].delete(listener),
    writeFile: async (path: string, data: Uint8Array) => {
      files.set(path, data);
      return true;
    },
    readFile: async (path: string) => {
      const data = files.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return data;
    },
    deleteFile: async (path: string) => {
      fake.deleted.push(path);
      files.delete(path);
      return true;
    },
    exec: async (args: string[]) => {
      fake.execCalls.push(args);
      if (options.hang) {
        return new Promise<number>((_, reject) => {
          rejectHang = reject;
        });
      }
      listeners.progress.forEach((listener) => listener({ progress: 0.5, time: 1_000_000 }));
      listeners.log.forEach((listener) => listener({ type: "stderr", message: "frame=10 time=00:00:01.50 bitrate=" }));
      const output = args.at(-1)!;
      if (output.endsWith(".png")) files.set(output, new Uint8Array([0x89, 0x50]));
      if (output.endsWith(".gif")) files.set(output, options.output ?? GIF_BYTES(options.sizeFor?.(args) ?? 1000));
      return 0;
    },
    terminate: () => {
      fake.terminated += 1;
      fake.loaded = false;
      rejectHang?.(new Error("called FFmpeg.terminate()"));
    },
  };
  return fake;
}

const meta: VideoMetadata = { duration: 4, width: 640, height: 360, container: "mp4", previewable: true };
const file = new Blob([new Uint8Array(1024)], { type: "video/mp4" });
const loadConfig = () => ({ coreURL: "core.js", wasmURL: "core.wasm" });

function engineFor(fake: ReturnType<typeof createFakeFFmpeg>) {
  // Node has no Worker global; the engine checks for it before loading.
  vi.stubGlobal("Worker", class {});
  return new FFmpegEngine(async () => fake as unknown as FFmpegLike, loadConfig);
}

describe("FFmpeg engine + conversion", () => {
  it("produces a GIF blob, reports real progress and deletes every temp file", async () => {
    const fake = createFakeFFmpeg();
    const engine = engineFor(fake);
    const progress: number[] = [];
    const result = await convertToGif({
      engine,
      file,
      meta,
      settings: { ...defaultSettings(640), targetMB: null },
      onProgress: (event) => progress.push(event.value),
    });
    expect(result.blob.type).toBe("image/gif");
    expect(result.width).toBe(64);
    expect(result.attempts).toHaveLength(1);
    expect(fake.execCalls).toHaveLength(2);
    expect(fake.execCalls[0].join(" ")).toContain("palettegen");
    expect(fake.execCalls[1].join(" ")).toContain("paletteuse");
    expect(progress.some((value) => value > 0 && value < 1)).toBe(true);
    expect(fake.files.size).toBe(0);
    expect(fake.deleted).toEqual(expect.arrayContaining(["input.mp4", "palette.png", "out.gif"]));
    expect(engine.isBusy).toBe(false);
  });

  it("retries with reduced settings until the measured size meets the target", async () => {
    const fake = createFakeFFmpeg({
      sizeFor: (args) => {
        const graph = args[args.indexOf("-lavfi") + 1];
        const fps = Number(/fps=(\d+)/.exec(graph)![1]);
        const width = Number(/scale=(\d+)/.exec(graph)![1]);
        return fps * width * width * 0.9;
      },
    });
    const result = await convertToGif({
      engine: engineFor(fake),
      file,
      meta,
      settings: { ...defaultSettings(640), targetMB: 1, mode: "quality" },
    });
    expect(result.attempts.length).toBeGreaterThan(1);
    expect(result.meetsTarget).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(1 * MB);
    expect(result.stopReason).toBe("target-met");
    expect(fake.files.size).toBe(0);
  });

  it("reports strict-mode failure honestly instead of claiming success", async () => {
    const fake = createFakeFFmpeg({ sizeFor: () => 3 * MB });
    const result = await convertToGif({
      engine: engineFor(fake),
      file,
      meta,
      settings: { ...defaultSettings(640), targetMB: 0.5, mode: "strict" },
    });
    expect(result.meetsTarget).toBe(false);
    expect(result.mode).toBe("strict");
    expect(result.bytes).toBeGreaterThan(0.5 * MB);
  });

  it("rejects encoder output that is not a GIF", async () => {
    const fake = createFakeFFmpeg({ output: new Uint8Array(100) });
    await expect(
      convertToGif({ engine: engineFor(fake), file, meta, settings: { ...defaultSettings(640), targetMB: null } }),
    ).rejects.toMatchObject({ code: "ENCODE_FAILED" });
  });

  it("cancels by terminating the worker, unlocks, and reloads for the next job", async () => {
    const fake = createFakeFFmpeg({ hang: true });
    const engine = engineFor(fake);
    const controller = new AbortController();
    const running = convertToGif({ engine, file, meta, settings: defaultSettings(640), signal: controller.signal });
    await vi.waitFor(() => expect(fake.execCalls.length).toBe(1));
    controller.abort();
    await expect(running).rejects.toMatchObject({ code: "CANCELLED" });
    expect(fake.terminated).toBe(1);
    expect(engine.isBusy).toBe(false);
    expect(engine.isLoaded).toBe(false);
  });

  it("refuses duplicate concurrent jobs", async () => {
    const fake = createFakeFFmpeg({ hang: true });
    const engine = engineFor(fake);
    const first = convertToGif({ engine, file, meta, settings: defaultSettings(640) });
    await vi.waitFor(() => expect(fake.execCalls.length).toBe(1));
    await expect(convertToGif({ engine, file, meta, settings: defaultSettings(640) })).rejects.toMatchObject({ code: "BUSY" });
    engine.terminate();
    await expect(first).rejects.toBeInstanceOf(AppError);
  });

  it("maps load failures to a clear asset error", async () => {
    vi.stubGlobal("Worker", class {});
    const fake = createFakeFFmpeg();
    fake.load.mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"));
    const engine = new FFmpegEngine(async () => fake as unknown as FFmpegLike, loadConfig);
    await expect(engine.load()).rejects.toMatchObject({ code: "ASSET_LOAD_FAILED" });
    expect(fake.terminated).toBe(1);
  });
});
