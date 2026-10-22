import { MB, videoProcessingBudgetMs, videoLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { encodeArgs, paletteArgs, probeArgs } from "@/features/video/lib/ffmpeg-args";
import type { FFmpegEngine } from "@/features/video/lib/ffmpeg-engine";
import { countGifFrames, gifDimensions, isGif } from "@/features/video/lib/gif";
import { planNext, pickBest, type AttemptRecord, type StopReason } from "@/features/video/lib/optimizer";
import { DECODE_FAILED_MESSAGE, inputFileName, parseProbeLog, type VideoMetadata } from "@/features/video/lib/probe";
import { clipDuration, initialEncodeParams, type EncodeParams, type GifSettings } from "@/features/video/lib/settings";
import type { VideoContainer } from "@/lib/file-sniff";

export interface ConversionProgress {
  attempt: number;
  stage: "preparing" | "palette" | "encoding";
  /** 0–1 within the current attempt, derived from FFmpeg's reported media time. */
  value: number;
  reason?: string;
}

export interface AttemptSummary {
  params: EncodeParams;
  bytes: number;
  durationMs: number;
  reason: string;
}

export interface ConversionResult {
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  frames: number | null;
  params: EncodeParams;
  attempts: AttemptSummary[];
  bestIndex: number;
  targetBytes: number | null;
  meetsTarget: boolean;
  stopReason: StopReason;
  mode: GifSettings["mode"];
  clipSeconds: number;
}

const PALETTE_WEIGHT = 0.3;

/** Reads metadata with FFmpeg when the browser itself cannot decode the file. */
export async function ffmpegProbe(
  engine: FFmpegEngine,
  file: Blob,
  container: VideoContainer,
  signal?: AbortSignal,
): Promise<{ duration: number; width: number; height: number; codec: string }> {
  return engine.run(async (ctx) => {
    const input = await ctx.provideInput(file, inputFileName(container));
    // `ffmpeg -i` without an output exits non-zero by design; we only need the log.
    await ctx.exec(probeArgs(input));
    const parsed = parseProbeLog(ctx.logs);
    if (!parsed.video) throw new AppError("DECODE_FAILED", DECODE_FAILED_MESSAGE);
    if (parsed.duration === null) throw new AppError("DECODE_FAILED", "The video duration could not be determined. Try exporting it as MP4 or WebM.");
    return { duration: parsed.duration, ...parsed.video };
  }, signal);
}

/**
 * Converts a clip to GIF with palette generation + palette mapping, then measures the
 * real output and lets the planner decide whether another attempt is worthwhile.
 */
export async function convertToGif({
  engine,
  file,
  meta,
  settings,
  signal,
  onProgress,
  now = () => performance.now(),
}: {
  engine: FFmpegEngine;
  file: Blob;
  meta: VideoMetadata;
  settings: GifSettings;
  signal?: AbortSignal;
  onProgress?: (progress: ConversionProgress) => void;
  now?: () => number;
}): Promise<ConversionResult> {
  const clipSeconds = clipDuration(settings, meta.duration);
  const clip = { start: settings.start, duration: clipSeconds };
  const targetBytes = settings.targetMB === null ? null : Math.round(settings.targetMB * MB);
  const initial = initialEncodeParams(settings);
  const startedAt = now();
  const budgetMs = videoProcessingBudgetMs(clipSeconds);
  const plannerLimits = { maxAttempts: videoLimits.maxAttempts, processingBudgetMs: budgetMs, minOutputWidth: videoLimits.minOutputWidth };

  // Hard stop slightly above the planner's budget, in case one attempt runs very long.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), budgetMs * 1.25);
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;

  try {
    return await engine.run(async (ctx) => {
      onProgress?.({ attempt: 1, stage: "preparing", value: 0 });
      const input = await ctx.provideInput(file, inputFileName(meta.container));

      const attempts: AttemptSummary[] = [];
      const outputs: Uint8Array[] = [];
      let best: { bytes: Uint8Array; index: number } | null = null;
      let stopReason: StopReason = "no-target";

      for (;;) {
        const decision = planNext({
          initial,
          attempts: attempts as AttemptRecord[],
          targetBytes,
          mode: settings.mode,
          elapsedMs: now() - startedAt,
          limits: plannerLimits,
        });
        if (decision.action === "stop") {
          stopReason = decision.reason;
          break;
        }
        const attemptNumber = attempts.length + 1;
        const params = decision.params;
        const attemptStart = now();
        let value = 0;
        const report = (stage: ConversionProgress["stage"], next: number) => {
          value = Math.max(value, Math.min(1, next));
          onProgress?.({ attempt: attemptNumber, stage, value, reason: decision.reason });
        };

        report("palette", 0);
        const paletteCode = await ctx.exec(paletteArgs(input, "palette.png", clip, params), (time) =>
          report("palette", (time / clipSeconds) * PALETTE_WEIGHT),
        );
        if (paletteCode !== 0) throw new AppError("DECODE_FAILED", DECODE_FAILED_MESSAGE);

        report("encoding", PALETTE_WEIGHT);
        const encodeCode = await ctx.exec(encodeArgs(input, "palette.png", "out.gif", clip, params), (time) =>
          report("encoding", PALETTE_WEIGHT + (time / clipSeconds) * (1 - PALETTE_WEIGHT)),
        );
        if (encodeCode !== 0) throw new AppError("ENCODE_FAILED");

        const output = await ctx.readFile("out.gif");
        await ctx.deleteFile("out.gif");
        await ctx.deleteFile("palette.png");
        if (!isGif(output)) throw new AppError("ENCODE_FAILED", "The encoder did not produce a valid GIF.");
        report("encoding", 1);

        attempts.push({ params, bytes: output.byteLength, durationMs: now() - attemptStart, reason: decision.reason });
        outputs.push(output);
        // Keep only the current best output in memory.
        const pick = pickBest(attempts as AttemptRecord[], targetBytes);
        best = { bytes: outputs[pick.index], index: pick.index };
        outputs.forEach((_, index) => {
          if (index !== pick.index) outputs[index] = new Uint8Array(0);
        });
      }

      if (!best) throw new AppError("ENCODE_FAILED");
      const chosen = attempts[best.index];
      const dimensions = gifDimensions(best.bytes) ?? { width: chosen.params.width, height: chosen.params.height ?? 0 };
      const { meetsTarget } = pickBest(attempts as AttemptRecord[], targetBytes);
      return {
        blob: new Blob([best.bytes as BlobPart], { type: "image/gif" }),
        bytes: best.bytes.byteLength,
        width: dimensions.width,
        height: dimensions.height,
        frames: countGifFrames(best.bytes),
        params: chosen.params,
        attempts,
        bestIndex: best.index,
        targetBytes,
        meetsTarget,
        stopReason,
        mode: settings.mode,
        clipSeconds,
      };
    }, combined);
  } catch (error) {
    if (timeout.signal.aborted && !signal?.aborted) {
      throw new AppError("TIMEOUT", "Conversion took too long and was stopped. Try a shorter clip or a smaller width.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
