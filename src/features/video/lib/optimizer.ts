import { videoLimits } from "@/config/limits";
import { toEven, type DitherMode, type EncodeParams, type SizeMode } from "@/features/video/lib/settings";

/**
 * Deterministic target-size planner. It never touches FFmpeg: given the measured
 * attempts so far it decides the next parameters or why to stop.
 *
 * Order of reductions (cheapest perceptual cost first):
 *   1. frame rate, gradually (≥ 0.67× per step) down to a floor;
 *   2. output width, ≥ 0.75× per step, down to a floor;
 *   3. strict mode only: palette size and dithering as a last resort.
 * Quality Priority never touches colours/dithering and uses higher floors.
 */

export interface AttemptRecord {
  params: EncodeParams;
  bytes: number;
  durationMs: number;
}

export type StopReason = "no-target" | "target-met" | "max-attempts" | "budget" | "floors-reached";

export type PlanDecision =
  | { action: "retry"; params: EncodeParams; reason: string }
  | { action: "stop"; reason: StopReason };

export interface PlannerLimits {
  maxAttempts: number;
  processingBudgetMs: number;
  minOutputWidth: number;
}

export const defaultPlannerLimits: PlannerLimits = {
  maxAttempts: videoLimits.maxAttempts,
  processingBudgetMs: videoLimits.processingBudgetMs,
  minOutputWidth: videoLimits.minOutputWidth,
};

export const floors = {
  quality: { fps: 10, width: 240 },
  strict: { fps: 6, width: videoLimits.minOutputWidth },
} as const;

const MIN_FPS_FACTOR = 0.67;
const MIN_WIDTH_FACTOR = 0.75;
/** Aim slightly below the target so a near miss does not need another pass. */
const SAFETY = 0.92;

const colourSteps: { maxColors: number; dither: DitherMode }[] = [
  { maxColors: 128, dither: "bayer5" },
  { maxColors: 64, dither: "bayer5" },
  { maxColors: 64, dither: "none" },
];

export interface PlanInput {
  initial: EncodeParams;
  attempts: readonly AttemptRecord[];
  targetBytes: number | null;
  mode: SizeMode;
  elapsedMs: number;
  limits?: PlannerLimits;
}

export function planNext({ initial, attempts, targetBytes, mode, elapsedMs, limits = defaultPlannerLimits }: PlanInput): PlanDecision {
  const last = attempts.at(-1);
  if (!last) return { action: "retry", params: initial, reason: "Initial encode" };
  if (targetBytes === null) return { action: "stop", reason: "no-target" };
  if (last.bytes <= targetBytes) return { action: "stop", reason: "target-met" };
  if (attempts.length >= limits.maxAttempts) return { action: "stop", reason: "max-attempts" };

  const averageMs = attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) / attempts.length;
  if (elapsedMs + averageMs > limits.processingBudgetMs) return { action: "stop", reason: "budget" };

  const current = last.params;
  const fpsFloor = Math.min(initial.fps, floors[mode].fps);
  const widthFloor = Math.min(initial.width, Math.max(limits.minOutputWidth, floors[mode].width));
  let needed = (targetBytes / last.bytes) * SAFETY;
  const next: EncodeParams = { ...current };
  const changes: string[] = [];

  // 1. Frame rate: size scales roughly linearly with the number of frames.
  if (current.fps > fpsFloor) {
    const factor = Math.max(MIN_FPS_FACTOR, Math.min(1, needed));
    let fps = Math.max(fpsFloor, Math.round(current.fps * factor));
    if (fps >= current.fps) fps = current.fps - 1;
    next.fps = Math.max(fpsFloor, fps);
    needed /= next.fps / current.fps;
    changes.push(`frame rate ${current.fps} → ${next.fps} fps`);
  }

  // 2. Width: size scales roughly with pixel area (width²).
  if (needed < 0.97 && current.width > widthFloor) {
    const factor = Math.max(MIN_WIDTH_FACTOR, Math.min(1, Math.sqrt(needed)));
    let width = Math.max(widthFloor, toEven(current.width * factor));
    if (width >= current.width) width = Math.max(widthFloor, current.width - 2);
    const scale = width / current.width;
    next.width = width;
    if (current.height !== null) next.height = Math.max(2, toEven(current.height * scale));
    changes.push(`width ${current.width} → ${width} px`);
  }

  // 3. Strict mode: palette reductions only once motion and size are at their floors.
  if (changes.length === 0 && mode === "strict") {
    const step = colourSteps.find(
      (candidate) =>
        candidate.maxColors < current.maxColors ||
        (candidate.maxColors === current.maxColors && candidate.dither === "none" && current.dither !== "none"),
    );
    if (step) {
      next.maxColors = step.maxColors;
      next.dither = step.dither;
      next.statsMode = "diff";
      changes.push(`palette ${current.maxColors} → ${step.maxColors} colours${step.dither === "none" ? ", no dithering" : ""}`);
    }
  }

  if (changes.length === 0) return { action: "stop", reason: "floors-reached" };
  return { action: "retry", params: next, reason: `Reduce ${changes.join(", ")}` };
}

/**
 * Best attempt: the largest (highest quality) one that meets the target, otherwise
 * the smallest overall. Without a target, the only attempt.
 */
export function pickBest(attempts: readonly AttemptRecord[], targetBytes: number | null): { index: number; meetsTarget: boolean } {
  if (attempts.length === 0) throw new Error("No attempts");
  if (targetBytes !== null) {
    let bestIndex = -1;
    attempts.forEach((attempt, index) => {
      if (attempt.bytes <= targetBytes && (bestIndex < 0 || attempt.bytes > attempts[bestIndex].bytes)) bestIndex = index;
    });
    if (bestIndex >= 0) return { index: bestIndex, meetsTarget: true };
  }
  let smallest = 0;
  attempts.forEach((attempt, index) => {
    if (attempt.bytes < attempts[smallest].bytes) smallest = index;
  });
  return { index: targetBytes === null ? attempts.length - 1 : smallest, meetsTarget: targetBytes === null };
}

export const stopReasonText: Record<StopReason, string> = {
  "no-target": "No size target was set.",
  "target-met": "The target size was reached.",
  "max-attempts": `Stopped after the maximum of ${videoLimits.maxAttempts} encoding attempts.`,
  budget: "Stopped to stay within the processing time budget.",
  "floors-reached": "Frame rate and dimensions reached their minimum for this mode.",
};
