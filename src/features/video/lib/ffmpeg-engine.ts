import type { FFFSType, FFmpeg } from "@ffmpeg/ffmpeg";
import { ffmpegAssets } from "@/config/ffmpeg";
import { videoLimits } from "@/config/limits";
import { AppError, isAppError } from "@/lib/errors";
import { formatBytes } from "@/lib/format";

/** The subset of the FFmpeg class the engine uses (lets tests inject a fake). */
export type FFmpegLike = Pick<
  FFmpeg,
  | "loaded"
  | "load"
  | "exec"
  | "writeFile"
  | "readFile"
  | "deleteFile"
  | "createDir"
  | "deleteDir"
  | "mount"
  | "unmount"
  | "on"
  | "off"
  | "terminate"
>;

/** Read-only mount point for source files (WORKERFS reads lazily from the Blob). */
const INPUT_DIR = "/source";

export type FFmpegFactory = () => Promise<FFmpegLike>;

type FFmpegModule = typeof import("@ffmpeg/ffmpeg");

/**
 * Loads the unbundled FFmpeg ESM build from /public at runtime. Its own module Web
 * Worker then imports the single-threaded core and WebAssembly from the same origin.
 */
const defaultFactory: FFmpegFactory = async () => {
  let mod: FFmpegModule;
  try {
    mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ffmpegAssets.module)) as FFmpegModule;
  } catch (error) {
    throw new AppError("ASSET_LOAD_FAILED", undefined, { cause: error });
  }
  return new mod.FFmpeg();
};

function absolute(path: string): string {
  return new URL(path, window.location.href).href;
}

const defaultLoadConfig = () => ({ coreURL: absolute(ffmpegAssets.core), wasmURL: absolute(ffmpegAssets.wasm) });

export interface JobContext {
  /**
   * Makes a source file available to FFmpeg and returns its path. Large files are mounted
   * read-only instead of being copied into WebAssembly memory.
   */
  provideInput(file: Blob, name: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
  /** Runs FFmpeg, streaming encoded media time (seconds) to `onTime`. Resolves with the exit code. */
  exec(args: string[], onTime?: (seconds: number) => void): Promise<number>;
  /** stderr lines captured during this job. */
  logs: string[];
}

export class FFmpegEngine {
  private instance: FFmpegLike | null = null;
  private loading: Promise<FFmpegLike> | null = null;
  private busy = false;

  constructor(
    private readonly factory: FFmpegFactory = defaultFactory,
    private readonly loadConfig: () => { coreURL: string; wasmURL: string } = defaultLoadConfig,
  ) {}

  get isBusy(): boolean {
    return this.busy;
  }

  get isLoaded(): boolean {
    return Boolean(this.instance?.loaded);
  }

  /** Loads FFmpeg once; concurrent callers share the same load. */
  load(): Promise<FFmpegLike> {
    if (this.instance?.loaded) return Promise.resolve(this.instance);
    this.loading ??= this.createInstance().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async createInstance(): Promise<FFmpegLike> {
    if (typeof WebAssembly === "undefined" || typeof Worker === "undefined") {
      throw new AppError("WORKER_INIT_FAILED", "This browser does not support WebAssembly workers, which video conversion needs.");
    }
    const ffmpeg = await this.factory();
    try {
      await ffmpeg.load(this.loadConfig());
    } catch (error) {
      ffmpeg.terminate();
      const message = error instanceof Error ? error.message : String(error);
      throw /fetch|import|network|load/i.test(message)
        ? new AppError("ASSET_LOAD_FAILED", undefined, { cause: error })
        : new AppError("WORKER_INIT_FAILED", undefined, { cause: error });
    }
    this.instance = ffmpeg;
    return ffmpeg;
  }

  /**
   * Runs one job with exclusive access. Aborting terminates the worker (the only way to
   * stop a running FFmpeg command); the next job reloads it. Temporary files written
   * through the context are always deleted when the job ends.
   */
  async run<T>(job: (context: JobContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.busy) throw new AppError("BUSY");
    if (signal?.aborted) throw new AppError("CANCELLED");
    this.busy = true;
    const tempFiles = new Set<string>();
    const logs: string[] = [];
    let ffmpeg: FFmpegLike | null = null;
    let mounted = false;
    let timeListener: ((seconds: number) => void) | undefined;

    const onLog = ({ message }: { type: string; message: string }) => {
      logs.push(message);
      if (logs.length > 2000) logs.splice(0, logs.length - 2000);
      const match = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(message);
      if (match && timeListener) timeListener(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    };
    const onProgress = ({ time }: { progress: number; time: number }) => {
      // `time` is the encoded media position in microseconds.
      if (timeListener && Number.isFinite(time) && time > 0) timeListener(time / 1_000_000);
    };

    const abort = () => this.terminate();
    signal?.addEventListener("abort", abort, { once: true });

    try {
      ffmpeg = await this.load();
      if (signal?.aborted) throw new AppError("CANCELLED");
      const active = ffmpeg;
      active.on("log", onLog);
      active.on("progress", onProgress);
      const context: JobContext = {
        logs,
        provideInput: async (file, name) => {
          try {
            await active.createDir(INPUT_DIR).catch(() => undefined);
            mounted = await active.mount("WORKERFS" as FFFSType, { blobs: [{ name, data: file }] }, INPUT_DIR);
          } catch {
            mounted = false;
          }
          if (mounted) return `${INPUT_DIR}/${name}`;
          if (file.size > videoLimits.maxCopiedInputBytes) {
            throw new AppError(
              "FILE_TOO_LARGE",
              `This browser cannot stream large files to the converter. Use a file under ${formatBytes(videoLimits.maxCopiedInputBytes, 0)} or try Chrome, Edge or Firefox.`,
            );
          }
          tempFiles.add(name);
          await active.writeFile(name, new Uint8Array(await file.arrayBuffer()));
          return name;
        },
        writeFile: async (path, data) => {
          tempFiles.add(path);
          await active.writeFile(path, data);
        },
        readFile: async (path) => {
          const data = await active.readFile(path);
          if (typeof data === "string") throw new AppError("ENCODE_FAILED");
          return data;
        },
        deleteFile: async (path) => {
          tempFiles.delete(path);
          await active.deleteFile(path).catch(() => undefined);
        },
        exec: async (args, onTime) => {
          for (const arg of args) if (/^(palette|out|input)[\w.-]*\.\w+$/.test(arg)) tempFiles.add(arg);
          timeListener = onTime;
          try {
            return await active.exec(args);
          } finally {
            timeListener = undefined;
          }
        },
      };
      return await job(context);
    } catch (error) {
      if (signal?.aborted) throw new AppError("CANCELLED");
      if (isAppError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/terminate/i.test(message)) throw new AppError("CANCELLED");
      throw new AppError("ENCODE_FAILED", undefined, { cause: error });
    } finally {
      signal?.removeEventListener("abort", abort);
      if (ffmpeg && this.instance === ffmpeg) {
        ffmpeg.off("log", onLog);
        ffmpeg.off("progress", onProgress);
        await Promise.all([...tempFiles].map((path) => ffmpeg!.deleteFile(path).catch(() => undefined)));
        if (mounted) {
          await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
          await ffmpeg.deleteDir(INPUT_DIR).catch(() => undefined);
        }
      }
      this.busy = false;
    }
  }

  /** Stops any running command and frees the worker and its in-memory files. */
  terminate(): void {
    const instance = this.instance;
    this.instance = null;
    instance?.terminate();
  }
}
