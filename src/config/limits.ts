/**
 * Central resource limits. Every validator, optimiser and UI hint reads from here,
 * so changing a number in this file changes behaviour and copy together.
 */
export const MB = 1024 * 1024;
export const KB = 1024;

export const videoLimits = {
  /**
   * Sources are mounted read-only (WORKERFS) instead of being copied into WebAssembly
   * memory, so large files are fine; only the selected clip is decoded.
   */
  maxInputBytes: 2048 * MB,
  /** Largest file that may be copied into memory when the browser lacks WORKERFS support. */
  maxCopiedInputBytes: 300 * MB,
  maxDurationSeconds: 60 * 60,
  /** Frames in one GIF (e.g. 10 minutes at 20 fps). Protects memory and the browser tab. */
  maxOutputFrames: 12_000,
  /** frames × width × height of the GIF; bounds the output size kept in memory. */
  maxOutputFramePixels: 2_500_000_000,
  /** Clips longer than this get a "long conversion" notice with estimates. */
  longClipSeconds: 60,
  /** Largest source frame we are willing to decode (4K UHD). */
  maxSourcePixels: 3840 * 2160,
  minOutputWidth: 64,
  maxOutputWidth: 1280,
  minFps: 2,
  maxFps: 30,
  minTargetBytes: 100 * KB,
  maxTargetBytes: 500 * MB,
  /** Encoding passes allowed while searching for a target size (first pass included). */
  maxAttempts: 6,
  /** Minimum wall-clock budget for the whole optimisation, in milliseconds. */
  processingBudgetMs: 4 * 60 * 1000,
  /** Extra budget per second of clip, so long clips get proportionally more time. */
  budgetMsPerClipSecond: 6_000,
  maxProcessingBudgetMs: 2 * 60 * 60 * 1000,
} as const;

/** Time budget for converting a clip of the given length (scales with clip length). */
export function videoProcessingBudgetMs(clipSeconds: number): number {
  return Math.min(
    videoLimits.maxProcessingBudgetMs,
    Math.max(videoLimits.processingBudgetMs, clipSeconds * videoLimits.budgetMsPerClipSecond),
  );
}

export const imageLimits = {
  /** Browser-side processing cap. */
  maxBrowserInputBytes: 40 * MB,
  /**
   * Server-side cap. Vercel Functions reject request/response bodies over 4.5 MB,
   * so we stay well below it including multipart overhead.
   */
  maxServerInputBytes: 4 * MB,
  maxServerResponseBytes: 4.4 * MB,
  /** Decompression-bomb guard: maximum decoded pixels. */
  maxInputPixels: 50_000_000,
  maxOutputDimension: 8192,
  minOutputDimension: 1,
  maxAnimationFrames: 300,
  minTargetBytes: 5 * KB,
  /** Quality search steps for target-size compression. */
  maxQualitySteps: 8,
  maxResizeSteps: 4,
} as const;

export const qrLimits = {
  /** QR version 40 at level L holds 2,953 bytes; we keep headroom for UTF-8. */
  maxContentBytes: 2_900,
  maxBatchItems: 100,
  maxNameLength: 120,
  minMargin: 0,
  maxMargin: 16,
  minExportSize: 128,
  maxExportSize: 4096,
  previewCacheEntries: 200,
  maxBackupBytes: 20 * MB,
} as const;

export const jobHistoryLimits = {
  /** Lightweight metadata only; older entries are trimmed automatically. */
  maxEntries: 50,
} as const;
