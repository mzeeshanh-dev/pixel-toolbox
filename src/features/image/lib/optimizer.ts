import { imageLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import type { CompressionMode } from "./schema";

/**
 * Target-size optimiser shared by the browser and the Sharp service. The encoder is
 * injected, so every decision is based on the real encoded byte size of an attempt.
 *
 * Strategy (bounded and deterministic):
 *  1. Encode at the preferred quality. Done if there is no target or it already fits.
 *  2. Binary-search quality between the mode's floor and the preferred quality for the
 *     highest quality that fits the target.
 *  3. Strict mode only, when allowed: shrink dimensions in steps of ×0.85 and repeat a
 *     short quality search at each step.
 *  4. Report the actual outcome honestly, including a missed target.
 */

export interface EncodeAttempt {
  quality: number;
  scale: number;
}

export interface Encoded {
  size: number;
}

export interface AttemptInfo extends EncodeAttempt {
  attempt: number;
  maxAttempts: number;
  size: number;
}

export interface OptimizeParams<T extends Encoded> {
  encode: (attempt: EncodeAttempt) => Promise<T>;
  mode: CompressionMode;
  targetBytes: number | null;
  originalBytes: number;
  /** Quality ceiling (the preset / user choice). */
  preferredQuality: number;
  allowResize: boolean;
  /** The encoder is lossless; quality has no effect and is never searched. */
  lossless: boolean;
  signal?: AbortSignal;
  onAttempt?: (info: AttemptInfo) => void;
  maxQualitySteps?: number;
  maxResizeSteps?: number;
}

export interface OptimizeResult<T extends Encoded> {
  best: T & EncodeAttempt;
  attempts: number;
  /** null when no target was requested. */
  targetMet: boolean | null;
  largerThanOriginal: boolean;
  explanation: string | null;
  suggestion: string | null;
}

export const qualityFloors: Record<Exclude<CompressionMode, "lossless">, number> = {
  quality: 70,
  strict: 10,
};

export const RESIZE_STEP = 0.85;
const SEARCH_STEPS_PER_RESIZE = 3;

export async function optimizeToTarget<T extends Encoded>(params: OptimizeParams<T>): Promise<OptimizeResult<T>> {
  const maxQualitySteps = params.maxQualitySteps ?? imageLimits.maxQualitySteps;
  const maxResizeSteps = params.maxResizeSteps ?? imageLimits.maxResizeSteps;
  const resizeAllowed = params.mode === "strict" && params.allowResize && !params.lossless;
  const maxAttempts = params.lossless ? 1 : maxQualitySteps + (resizeAllowed ? maxResizeSteps * SEARCH_STEPS_PER_RESIZE : 0);
  const { targetBytes } = params;
  const ceiling = Math.round(Math.min(100, Math.max(1, params.preferredQuality)));

  let attempts = 0;
  let smallest: (T & EncodeAttempt) | null = null;

  const run = async (quality: number, scale: number): Promise<T & EncodeAttempt> => {
    if (params.signal?.aborted) throw new AppError("CANCELLED");
    if (attempts >= maxAttempts) throw new Error("attempt budget exceeded");
    const encoded = await params.encode({ quality, scale });
    attempts += 1;
    const candidate = { ...encoded, quality, scale };
    if (!smallest || candidate.size < smallest.size) smallest = candidate;
    params.onAttempt?.({ attempt: attempts, maxAttempts, quality, scale, size: encoded.size });
    return candidate;
  };

  const finish = (best: T & EncodeAttempt, targetMet: boolean | null, explanation: string | null, suggestion: string | null) => {
    const largerThanOriginal = best.size >= params.originalBytes;
    if (largerThanOriginal && !explanation) {
      explanation = `This image is already well optimised: the smallest result is ${formatBytes(best.size)}, not smaller than the original ${formatBytes(params.originalBytes)}.`;
      suggestion ??= "Keep the original file, or try a different output format such as WebP or AVIF.";
    }
    return { best, attempts, targetMet, largerThanOriginal, explanation, suggestion };
  };

  // Lossless: one encode, quality is irrelevant and pixels are never discarded.
  if (params.lossless) {
    const result = await run(100, 1);
    if (targetBytes === null || result.size <= targetBytes) return finish(result, targetBytes === null ? null : true, null, null);
    return finish(
      result,
      false,
      `Lossless encoding produced ${formatBytes(result.size)}, above the ${formatBytes(targetBytes)} target. Lossless mode never discards image data to reach a size.`,
      "Switch to Quality Priority or Strict Size Target, or choose a larger target.",
    );
  }

  const first = await run(ceiling, 1);
  if (targetBytes === null) return finish(first, null, null, null);
  if (first.size <= targetBytes) return finish(first, true, null, null);

  const floor = Math.min(ceiling, qualityFloors[params.mode === "strict" ? "strict" : "quality"]);

  /** Highest quality in [floor, hi] whose size fits, within a step budget. */
  const search = async (scale: number, hiResult: T & EncodeAttempt | null, budget: number) => {
    let used = 0;
    let hi = hiResult;
    if (!hi) {
      hi = await run(ceiling, scale);
      used += 1;
      if (hi.size <= targetBytes) return hi;
    }
    if (floor >= hi.quality || used >= budget) return null;
    const low = await run(floor, scale);
    used += 1;
    if (low.size > targetBytes) return null;
    let fits = low;
    let a = floor;
    let b = hi.quality;
    while (b - a > 1 && used < budget) {
      const mid = Math.floor((a + b) / 2);
      const candidate = await run(mid, scale);
      used += 1;
      if (candidate.size <= targetBytes) {
        fits = candidate;
        a = mid;
      } else {
        b = mid;
      }
    }
    return fits;
  };

  const atFullSize = await search(1, first, maxQualitySteps - 1);
  if (atFullSize) return finish(atFullSize, true, null, null);

  if (resizeAllowed) {
    let scale = 1;
    for (let step = 0; step < maxResizeSteps; step += 1) {
      scale = Number((scale * RESIZE_STEP).toFixed(4));
      const resized = await search(scale, null, SEARCH_STEPS_PER_RESIZE);
      if (resized) return finish(resized, true, null, null);
    }
  }

  const closest = smallest as unknown as T & EncodeAttempt;
  if (params.mode === "quality") {
    return finish(
      closest,
      false,
      `Reaching ${formatBytes(targetBytes)} would need quality below ${floor}, which Quality Priority avoids. The smallest result at quality ${floor} is ${formatBytes(closest.size)}.`,
      "Switch to Strict Size Target to trade more quality for size, or choose a larger target.",
    );
  }
  const scaleNote = closest.scale < 1 ? ` and ${Math.round(closest.scale * 100)}% of the dimensions` : "";
  return finish(
    closest,
    false,
    `Even at quality ${closest.quality}${scaleNote}, the smallest result is ${formatBytes(closest.size)}, above the ${formatBytes(targetBytes)} target.`,
    resizeAllowed
      ? "Choose a larger target, set smaller output dimensions, or try AVIF or WebP."
      : "Allow resizing, choose a larger target, or try a more efficient format such as AVIF or WebP.",
  );
}
