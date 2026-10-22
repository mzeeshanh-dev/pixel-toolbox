import { z } from "zod";
import { imageLimits } from "@/config/limits";
import { formatInfo, outputFormats } from "./formats";

/**
 * Shared option schemas. The UI validates with these before processing and the API
 * routes validate the same JSON again at the server boundary.
 */

const dimension = z
  .number()
  .int("Use whole pixels.")
  .min(imageLimits.minOutputDimension, `Use at least ${imageLimits.minOutputDimension} px.`)
  .max(imageLimits.maxOutputDimension, `Use at most ${imageLimits.maxOutputDimension} px.`);

export const resizeSchema = z
  .object({
    mode: z.enum(["none", "max", "exact"]),
    /** Longest edge for "max" mode. */
    maxDimension: dimension.optional(),
    width: dimension.optional(),
    height: dimension.optional(),
    keepAspect: z.boolean(),
    allowUpscale: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "max" && value.maxDimension === undefined) {
      ctx.addIssue({ code: "custom", path: ["maxDimension"], message: "Enter a maximum size in pixels." });
    }
    if (value.mode === "exact" && value.width === undefined && value.height === undefined) {
      ctx.addIssue({ code: "custom", path: ["width"], message: "Enter a width, a height, or both." });
    }
  });

export type ResizeOptions = z.infer<typeof resizeSchema>;

export const noResize: ResizeOptions = { mode: "none", keepAspect: true, allowUpscale: false };

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #ffffff.");

export const encodeOptionsSchema = z.object({
  format: z.enum(outputFormats),
  quality: z.number().int().min(1, "Quality must be 1–100.").max(100, "Quality must be 1–100."),
  /** Background used when flattening transparency into a format without alpha. */
  background: hexColor,
  chromaSubsampling: z.enum(["4:2:0", "4:4:4"]),
  progressive: z.boolean(),
  pngCompressionLevel: z.number().int().min(0).max(9),
  /** Lossy PNG: palette quantisation (server only). */
  pngPalette: z.boolean(),
  webpLossless: z.boolean(),
  avifLossless: z.boolean(),
  /** Encoder effort 0–100, mapped to each encoder's own range. */
  effort: z.number().int().min(0).max(100),
  tiffCompression: z.enum(["none", "lzw", "deflate", "jpeg"]),
  /** Explicit consent to drop all frames but the first of an animated image. */
  firstFrameOnly: z.boolean(),
  resize: resizeSchema,
});

export type EncodeOptions = z.infer<typeof encodeOptionsSchema>;

export const convertOptionsSchema = encodeOptionsSchema;

export const compressionModes = ["quality", "strict", "lossless"] as const;
export type CompressionMode = (typeof compressionModes)[number];
export const compressionPresets = ["auto", "high", "balanced", "small"] as const;
export type CompressionPreset = (typeof compressionPresets)[number];

export const compressOptionsSchema = encodeOptionsSchema
  .extend({
    mode: z.enum(compressionModes),
    preset: z.enum(compressionPresets),
    targetBytes: z
      .number()
      .int()
      .min(imageLimits.minTargetBytes, `Targets below ${imageLimits.minTargetBytes / 1024} KB are not supported.`)
      .max(imageLimits.maxBrowserInputBytes, "Target is larger than the maximum input size.")
      .nullable(),
    /** Strict mode only: allow shrinking dimensions when quality alone cannot hit the target. */
    allowResize: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.format === "gif") {
      ctx.addIssue({ code: "custom", path: ["format"], message: "GIF is not available as a compression output." });
    }
    if (value.mode === "lossless" && value.format === "jpeg") {
      ctx.addIssue({
        code: "custom",
        path: ["format"],
        message: "JPEG is always lossy. Choose PNG, WebP or AVIF for lossless compression.",
      });
    }
  });

export type CompressOptions = z.infer<typeof compressOptionsSchema>;

export const presetQuality: Record<CompressionPreset, number> = {
  auto: 80,
  high: 90,
  balanced: 75,
  small: 55,
};

export function defaultEncodeOptions(format: EncodeOptions["format"] = "webp"): EncodeOptions {
  return {
    format,
    quality: 82,
    background: "#ffffff",
    chromaSubsampling: "4:2:0",
    progressive: false,
    pngCompressionLevel: 6,
    pngPalette: false,
    webpLossless: false,
    avifLossless: false,
    effort: 50,
    tiffCompression: "lzw",
    firstFrameOnly: false,
    resize: noResize,
  };
}

export function defaultCompressOptions(format: EncodeOptions["format"] = "webp"): CompressOptions {
  return {
    ...defaultEncodeOptions(format),
    quality: presetQuality.auto,
    mode: "quality",
    preset: "auto",
    targetBytes: null,
    allowResize: false,
  };
}

/** True when the chosen settings write every pixel exactly (no quality loss). */
export function isLosslessEncode(options: EncodeOptions): boolean {
  switch (options.format) {
    case "png":
      return !options.pngPalette;
    case "webp":
      return options.webpLossless;
    case "avif":
      return options.avifLossless;
    case "tiff":
      return options.tiffCompression !== "jpeg";
    case "gif":
      return false;
    default:
      return false;
  }
}

/** Whether the quality slider has any effect for these settings. */
export function usesQuality(options: EncodeOptions): boolean {
  if (options.format === "png") return options.pngPalette;
  if (options.format === "tiff") return options.tiffCompression === "jpeg";
  if (options.format === "gif") return false;
  if (options.format === "webp") return !options.webpLossless;
  if (options.format === "avif") return !options.avifLossless;
  return formatInfo[options.format].lossy;
}

/** Turns a Zod error into { field path → message } for showing beside controls. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Encoder settings actually used for compression.
 * - Lossless mode forces the lossless variant of the chosen format at maximum effort.
 * - Lossy modes use lossy variants; PNG uses palette quantisation (reported as lossy).
 */
export function compressionEncodeOptions(options: CompressOptions): EncodeOptions {
  if (options.mode === "lossless") {
    return {
      ...options,
      pngPalette: false,
      pngCompressionLevel: 9,
      webpLossless: options.format === "webp",
      avifLossless: options.format === "avif",
      tiffCompression: options.format === "tiff" ? "deflate" : options.tiffCompression,
      effort: 100,
    };
  }
  return {
    ...options,
    pngPalette: options.format === "png",
    pngCompressionLevel: 9,
    webpLossless: false,
    avifLossless: false,
    tiffCompression: options.format === "tiff" ? "jpeg" : options.tiffCompression,
  };
}
