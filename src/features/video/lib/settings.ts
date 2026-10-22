import { z } from "zod";
import { MB, videoLimits } from "@/config/limits";
import { formatDuration } from "@/lib/format";

export type QualityPreference = "high" | "balanced" | "small";
export type SizeMode = "quality" | "strict";
export type DitherMode = "sierra2_4a" | "bayer3" | "bayer5" | "none";
export type StatsMode = "full" | "diff";

/** Concrete encoder parameters for one FFmpeg attempt. */
export interface EncodeParams {
  fps: number;
  width: number;
  /** null = derive from width, preserving aspect ratio. */
  height: number | null;
  maxColors: number;
  dither: DitherMode;
  statsMode: StatsMode;
}

/**
 * Quality preference → real encoder settings. Each step genuinely changes the output:
 * - High: full 256-colour palette from every pixel, error-diffusion dithering
 *   (smoothest gradients, largest files).
 * - Balanced: 256 colours weighted toward moving areas, ordered (Bayer) dithering,
 *   which compresses noticeably better with LZW.
 * - Smaller: 128 colours, coarse ordered dithering for the smallest files.
 */
export const qualityProfiles: Record<
  QualityPreference,
  Pick<EncodeParams, "maxColors" | "dither" | "statsMode"> & { label: string; description: string }
> = {
  high: {
    label: "High",
    description: "256 colours, error-diffusion dithering",
    maxColors: 256,
    dither: "sierra2_4a",
    statsMode: "full",
  },
  balanced: {
    label: "Balanced",
    description: "256 colours tuned for motion, ordered dithering",
    maxColors: 256,
    dither: "bayer3",
    statsMode: "diff",
  },
  small: {
    label: "Smaller",
    description: "128 colours, coarse ordered dithering",
    maxColors: 128,
    dither: "bayer5",
    statsMode: "diff",
  },
};

export interface GifSettings {
  start: number;
  /** null = until the end of the clip. */
  end: number | null;
  fps: number;
  width: number;
  keepAspect: boolean;
  height: number | null;
  quality: QualityPreference;
  /** null = no size target. */
  targetMB: number | null;
  mode: SizeMode;
}

export type PresetId = "high" | "balanced" | "small";

export const presets: Record<PresetId, { label: string; fps: number; width: number; quality: QualityPreference; targetMB: number | null }> = {
  high: { label: "High Quality", fps: 20, width: 640, quality: "high", targetMB: null },
  balanced: { label: "Balanced", fps: 15, width: 480, quality: "balanced", targetMB: 5 },
  small: { label: "Smaller File", fps: 10, width: 320, quality: "small", targetMB: 2 },
};

export const fpsOptions = [5, 10, 12, 15, 20, 24, 30].filter(
  (fps) => fps >= videoLimits.minFps && fps <= videoLimits.maxFps,
);

export const widthPresets = [240, 320, 480, 640, 800, 1024, 1280];

/** Even integer, as required by most encoders and scalers. */
export function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function maxWidthFor(sourceWidth: number): number {
  return Math.min(videoLimits.maxOutputWidth, toEven(sourceWidth) || videoLimits.maxOutputWidth);
}

export function applyPreset(presetId: PresetId, sourceWidth: number, current: GifSettings): GifSettings {
  const preset = presets[presetId];
  return {
    ...current,
    fps: preset.fps,
    width: Math.min(preset.width, maxWidthFor(sourceWidth)),
    height: null,
    keepAspect: true,
    quality: preset.quality,
    targetMB: preset.targetMB,
  };
}

export function defaultSettings(sourceWidth: number): GifSettings {
  return applyPreset(
    "balanced",
    sourceWidth,
    { start: 0, end: null, fps: 15, width: 480, keepAspect: true, height: null, quality: "balanced", targetMB: null, mode: "quality" },
  );
}

export interface SourceContext {
  duration: number;
  width: number;
  height: number;
}

export const MIN_CLIP_SECONDS = 0.2;

/** Builds the Zod schema for a specific source, so limits depend on the actual video. */
export function settingsSchema(source: SourceContext) {
  const maxWidth = maxWidthFor(source.width);
  return z
    .object({
      start: z.number({ error: "Enter a start time." }).min(0, "Start cannot be negative.").max(source.duration, "Start is after the end of the video."),
      end: z
        .number({ error: "Enter an end time." })
        .max(source.duration + 0.001, `End cannot be later than ${source.duration.toFixed(1)} s.`)
        .nullable(),
      fps: z
        .number()
        .int()
        .min(videoLimits.minFps, `Frame rate must be at least ${videoLimits.minFps} fps.`)
        .max(videoLimits.maxFps, `Frame rate cannot exceed ${videoLimits.maxFps} fps.`),
      width: z
        .number({ error: "Enter a width." })
        .int("Width must be a whole number.")
        .min(videoLimits.minOutputWidth, `Width must be at least ${videoLimits.minOutputWidth} px.`)
        .max(maxWidth, `Width cannot exceed ${maxWidth} px (source width or the ${videoLimits.maxOutputWidth} px limit).`),
      keepAspect: z.boolean(),
      height: z
        .number({ error: "Enter a height." })
        .int("Height must be a whole number.")
        .min(videoLimits.minOutputWidth, `Height must be at least ${videoLimits.minOutputWidth} px.`)
        .max(Math.min(videoLimits.maxOutputWidth, toEven(source.height)), "Height cannot exceed the source height.")
        .nullable(),
      quality: z.enum(["high", "balanced", "small"]),
      targetMB: z
        .number({ error: "Enter a target size." })
        .min(videoLimits.minTargetBytes / MB, `Target must be at least ${Math.round(videoLimits.minTargetBytes / 1024)} KB.`)
        .max(videoLimits.maxTargetBytes / MB, `Target cannot exceed ${videoLimits.maxTargetBytes / MB} MB.`)
        .nullable(),
      mode: z.enum(["quality", "strict"]),
    })
    .superRefine((value, ctx) => {
      const end = value.end ?? source.duration;
      if (end - value.start < MIN_CLIP_SECONDS) {
        ctx.addIssue({ code: "custom", path: ["end"], message: `The clip must be at least ${MIN_CLIP_SECONDS} s long.` });
      }
      const load = outputLoad(value, source);
      if (load.frames > videoLimits.maxOutputFrames) {
        ctx.addIssue({
          code: "custom",
          path: ["end"],
          message: `This clip would make a ${load.frames.toLocaleString("en")}-frame GIF. The limit is ${videoLimits.maxOutputFrames.toLocaleString("en")} frames — shorten the clip to ${formatDuration(maxClipSeconds(value.fps))} or lower the frame rate.`,
        });
      } else if (load.framePixels > videoLimits.maxOutputFramePixels) {
        ctx.addIssue({
          code: "custom",
          path: ["width"],
          message: `This clip is too long for ${value.width} px. Lower the width, the frame rate, or the clip length.`,
        });
      }
      if (!value.keepAspect && value.height === null) {
        ctx.addIssue({ code: "custom", path: ["height"], message: "Enter a height or keep the aspect ratio." });
      }
    });
}

export type FieldErrors = Partial<Record<keyof GifSettings, string>>;

export function validateSettings(
  settings: GifSettings,
  source: SourceContext,
): { ok: true; value: GifSettings } | { ok: false; errors: FieldErrors } {
  const parsed = settingsSchema(source).safeParse(settings);
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof GifSettings | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** Longest clip (in seconds) that stays within the frame limit at this frame rate. */
export function maxClipSeconds(fps: number): number {
  return Math.floor(videoLimits.maxOutputFrames / Math.max(1, fps));
}

/** Frame count and total output pixels for the requested clip. */
export function outputLoad(
  settings: Pick<GifSettings, "start" | "end" | "fps" | "width" | "height" | "keepAspect">,
  source: SourceContext,
): { frames: number; framePixels: number } {
  const frames = Math.max(1, Math.ceil(clipDuration(settings, source.duration) * settings.fps));
  const width = toEven(settings.width);
  const height =
    settings.keepAspect || settings.height === null ? toEven((width * source.height) / Math.max(1, source.width)) : toEven(settings.height);
  return { frames, framePixels: frames * width * height };
}

/**
 * Default trim window: the whole video when it fits the frame and pixel limits,
 * otherwise the longest clip from the start that does.
 */
export function defaultEnd(settings: Pick<GifSettings, "fps" | "width" | "height" | "keepAspect">, source: SourceContext): number | null {
  const probe = { ...settings, start: 0, end: null };
  const load = outputLoad(probe, source);
  if (load.frames <= videoLimits.maxOutputFrames && load.framePixels <= videoLimits.maxOutputFramePixels) return null;
  const perSecondPixels = load.framePixels / Math.max(MIN_CLIP_SECONDS, source.duration);
  const byPixels = videoLimits.maxOutputFramePixels / Math.max(1, perSecondPixels);
  return Math.max(MIN_CLIP_SECONDS, Math.floor(Math.min(maxClipSeconds(settings.fps), byPixels, source.duration)));
}

export function clipDuration(settings: Pick<GifSettings, "start" | "end">, sourceDuration: number): number {
  return Math.max(0, (settings.end ?? sourceDuration) - settings.start);
}

export function initialEncodeParams(settings: GifSettings): EncodeParams {
  const profile = qualityProfiles[settings.quality];
  return {
    fps: settings.fps,
    width: toEven(settings.width),
    height: settings.keepAspect || settings.height === null ? null : toEven(settings.height),
    maxColors: profile.maxColors,
    dither: profile.dither,
    statsMode: profile.statsMode,
  };
}

export function outputHeight(params: Pick<EncodeParams, "width" | "height">, source: { width: number; height: number }): number {
  if (params.height !== null) return params.height;
  return toEven((params.width * source.height) / Math.max(1, source.width));
}

export type Complexity = "Low" | "Medium" | "High";

/** Rough processing cost from frame count × output pixels. */
export function estimateComplexity(
  settings: GifSettings,
  source: SourceContext,
): { frames: number; complexity: Complexity } {
  const frames = Math.max(1, Math.round(clipDuration(settings, source.duration) * settings.fps));
  const params = initialEncodeParams(settings);
  const pixels = params.width * outputHeight(params, source);
  const work = frames * pixels;
  const complexity: Complexity = work < 15_000_000 ? "Low" : work < 60_000_000 ? "Medium" : "High";
  return { frames, complexity };
}
