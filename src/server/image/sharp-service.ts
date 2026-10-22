/**
 * Server-side image processing with Sharp. Independent of HTTP so it can be tested and
 * reused; never import this module from client code.
 */
import "server-only";
import sharp, { type Sharp } from "sharp";
import { imageLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { detectImageFormat } from "@/lib/file-sniff";
import { formatInfo, isInputFormat, serverDecodableFormats, type InputFormat, type OutputFormat } from "@/features/image/lib/formats";
import { optimizeToTarget, type AttemptInfo } from "@/features/image/lib/optimizer";
import { computeOutputDimensions } from "@/features/image/lib/resize";
import {
  compressionEncodeOptions,
  isLosslessEncode,
  type CompressOptions,
  type EncodeOptions,
} from "@/features/image/lib/schema";

// Serverless instances are short-lived; don't keep decoded images in Sharp's cache.
sharp.cache(false);

export interface SourceMetadata {
  format: InputFormat;
  width: number;
  /** Height of a single frame. */
  height: number;
  frames: number;
  hasAlpha: boolean;
}

export interface ImageResult {
  buffer: Buffer;
  format: OutputFormat;
  mime: string;
  width: number;
  height: number;
  frames: number;
  size: number;
  quality: number | null;
  lossless: boolean;
  scale: number;
}

export interface CompressResult extends ImageResult {
  attempts: number;
  targetMet: boolean | null;
  largerThanOriginal: boolean;
  explanation: string | null;
  suggestion: string | null;
}

const baseOptions = { limitInputPixels: imageLimits.maxInputPixels, failOn: "error" as const };

function mapSharpError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/pixel limit/i.test(message)) {
    return new AppError("DIMENSIONS_TOO_LARGE", "The image has too many pixels to process safely.");
  }
  if (/unsupported image format|bad seek|corrupt|premature end|invalid|unable to|vips/i.test(message)) {
    return new AppError("DECODE_FAILED", "The image could not be decoded. It may be corrupted.");
  }
  return new AppError("ENCODE_FAILED", "The image could not be processed with these settings.");
}

/** Validates real content (magic bytes + decoder metadata) before any heavy work. */
export async function readSourceMetadata(input: Buffer): Promise<SourceMetadata> {
  const detected = detectImageFormat(new Uint8Array(input.subarray(0, 512)));
  if (detected === "svg") {
    throw new AppError("UNSUPPORTED_FORMAT", "SVG files are not supported.");
  }
  if (detected === "heif") {
    throw new AppError("UNSUPPORTED_FORMAT", "HEIC/HEIF images are not supported. Export the photo as JPEG first.");
  }
  if (!isInputFormat(detected)) {
    throw new AppError("UNSUPPORTED_FORMAT", "This file is not a supported image (JPEG, PNG, WebP, GIF, AVIF or TIFF).");
  }
  if (!serverDecodableFormats.includes(detected)) {
    throw new AppError("UNSUPPORTED_FORMAT", `${detected.toUpperCase()} files cannot be processed on the server.`);
  }
  try {
    const meta = await sharp(input, { ...baseOptions, animated: true }).metadata();
    const width = meta.width ?? 0;
    const frames = meta.pages ?? 1;
    const height = meta.pageHeight ?? meta.height ?? 0;
    if (!width || !height) throw new AppError("DECODE_FAILED", "The image dimensions could not be read.");
    if (width * height > imageLimits.maxInputPixels || width * height * frames > imageLimits.maxInputPixels * 4) {
      throw new AppError("DIMENSIONS_TOO_LARGE", "The image has too many pixels to process safely.");
    }
    if (frames > imageLimits.maxAnimationFrames) {
      throw new AppError(
        "DIMENSIONS_TOO_LARGE",
        `Animated images are limited to ${imageLimits.maxAnimationFrames} frames; this one has ${frames}.`,
      );
    }
    return { format: detected, width, height, frames, hasAlpha: Boolean(meta.hasAlpha) };
  } catch (error) {
    throw mapSharpError(error);
  }
}

function effortFor(format: OutputFormat, effort: number): number {
  const ranges: Partial<Record<OutputFormat, number>> = { webp: 6, avif: 9, gif: 10, png: 10 };
  const max = ranges[format] ?? 6;
  return Math.round((effort / 100) * max);
}

function applyEncoder(pipeline: Sharp, options: EncodeOptions, quality: number): Sharp {
  const effort = effortFor(options.format, options.effort);
  switch (options.format) {
    case "jpeg":
      return pipeline.jpeg({
        quality,
        chromaSubsampling: options.chromaSubsampling,
        progressive: options.progressive,
        mozjpeg: true,
      });
    case "png":
      return options.pngPalette
        ? pipeline.png({ palette: true, quality, compressionLevel: 9, effort })
        : pipeline.png({ compressionLevel: options.pngCompressionLevel, adaptiveFiltering: true });
    case "webp":
      return options.webpLossless
        ? pipeline.webp({ lossless: true, effort })
        : pipeline.webp({ quality, effort, smartSubsample: true });
    case "avif":
      return pipeline.avif({ quality, lossless: options.avifLossless, effort });
    case "tiff":
      return pipeline.tiff({
        compression: options.tiffCompression,
        quality: options.tiffCompression === "jpeg" ? quality : undefined,
        predictor: options.tiffCompression === "jpeg" || options.tiffCompression === "none" ? undefined : "horizontal",
      });
    case "gif":
      return pipeline.gif({ effort, dither: 1 });
  }
}

/** Encodes once with explicit quality and scale. */
export async function encodeImage(
  input: Buffer,
  source: SourceMetadata,
  options: EncodeOptions,
  attempt: { quality: number; scale: number } = { quality: options.quality, scale: 1 },
): Promise<ImageResult> {
  const animatedSource = source.frames > 1;
  const keepAnimation = animatedSource && formatInfo[options.format].animation && !options.firstFrameOnly;
  if (animatedSource && !keepAnimation && !options.firstFrameOnly) {
    throw new AppError(
      "INVALID_SETTINGS",
      "This image is animated. Confirm “Convert first frame only” or choose an animated output (WebP or GIF).",
      { field: "firstFrameOnly" },
    );
  }

  const target = computeOutputDimensions({ width: source.width, height: source.height }, options.resize, attempt.scale);

  try {
    let pipeline = sharp(input, { ...baseOptions, animated: keepAnimation, pages: keepAnimation ? -1 : 1 }).rotate();
    if (target.width !== source.width || target.height !== source.height) {
      pipeline = pipeline.resize(target.width, target.height, { fit: "fill", kernel: "lanczos3" });
    }
    const dropsAlpha = !formatInfo[options.format].alpha || (options.format === "tiff" && options.tiffCompression === "jpeg");
    if (source.hasAlpha && dropsAlpha) pipeline = pipeline.flatten({ background: options.background });
    pipeline = applyEncoder(pipeline, options, attempt.quality);

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const frames = keepAnimation ? source.frames : 1;
    const lossless = isLosslessEncode(options);
    return {
      buffer: data,
      format: options.format,
      mime: formatInfo[options.format].mime,
      width: info.width,
      height: keepAnimation ? Math.round(info.height / frames) : info.height,
      frames,
      size: data.length,
      quality: lossless || options.format === "gif" ? null : attempt.quality,
      lossless,
      scale: attempt.scale,
    };
  } catch (error) {
    throw mapSharpError(error);
  }
}

export async function convertImage(input: Buffer, options: EncodeOptions): Promise<ImageResult> {
  const source = await readSourceMetadata(input);
  return encodeImage(input, source, options);
}

export async function compressImage(
  input: Buffer,
  options: CompressOptions,
  hooks: { signal?: AbortSignal; onAttempt?: (info: AttemptInfo) => void } = {},
): Promise<CompressResult> {
  const source = await readSourceMetadata(input);
  const effective = compressionEncodeOptions(options);

  const outcome = await optimizeToTarget({
    encode: (attempt) => encodeImage(input, source, effective, attempt),
    mode: options.mode,
    targetBytes: options.targetBytes,
    originalBytes: input.length,
    preferredQuality: options.quality,
    allowResize: options.allowResize,
    lossless: isLosslessEncode(effective),
    signal: hooks.signal,
    onAttempt: hooks.onAttempt,
  });

  const { best } = outcome;
  return {
    buffer: best.buffer,
    format: best.format,
    mime: best.mime,
    width: best.width,
    height: best.height,
    frames: best.frames,
    size: best.size,
    quality: best.lossless ? null : best.quality,
    lossless: best.lossless,
    scale: best.scale,
    attempts: outcome.attempts,
    targetMet: outcome.targetMet,
    largerThanOriginal: outcome.largerThanOriginal,
    explanation: outcome.explanation,
    suggestion: outcome.suggestion,
  };
}
