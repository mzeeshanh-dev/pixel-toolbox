import { AppError } from "@/lib/errors";
import type { SourceImage } from "./analyze";
import { formatInfo } from "./formats";
import { optimizeToTarget, type AttemptInfo } from "./optimizer";
import { computeOutputDimensions, type Dimensions } from "./resize";
import { compressionEncodeOptions, isLosslessEncode, type CompressOptions, type EncodeOptions } from "./schema";
import type { ProcessResult } from "./types";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function releaseCanvas(canvas: AnyCanvas) {
  canvas.width = 0;
  canvas.height = 0;
}

async function canvasToBlob(canvas: AnyCanvas, mime: string, quality: number): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: mime, quality });
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, mime, quality));
}

async function decode(source: SourceImage): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source.file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new AppError("DECODE_FAILED", "The image could not be decoded in this browser.", { cause: error });
  }
}

/** Draws and encodes one candidate. The returned type is verified — never a silent fallback. */
async function encodeBitmap(bitmap: ImageBitmap, size: Dimensions, options: EncodeOptions, quality: number) {
  const info = formatInfo[options.format];
  const canvas = createCanvas(size.width, size.height);
  try {
    const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) throw new AppError("ENCODE_FAILED", "The browser could not create a drawing surface.");
    if (!info.alpha) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvasToBlob(canvas, info.mime, quality / 100);
    if (!blob || blob.type !== info.mime) {
      throw new AppError("UNSUPPORTED_FORMAT", `This browser cannot encode ${info.label} images.`);
    }
    return blob;
  } finally {
    releaseCanvas(canvas);
  }
}

function sourceSize(source: SourceImage, bitmap: ImageBitmap): Dimensions {
  return { width: source.width ?? bitmap.width, height: source.height ?? bitmap.height };
}

export async function browserConvert(source: SourceImage, options: EncodeOptions, signal: AbortSignal): Promise<ProcessResult> {
  const bitmap = await decode(source);
  try {
    if (signal.aborted) throw new AppError("CANCELLED");
    const size = computeOutputDimensions(sourceSize(source, bitmap), options.resize);
    const blob = await encodeBitmap(bitmap, size, options, options.quality);
    const lossless = isLosslessEncode(options);
    return {
      blob,
      format: options.format,
      width: size.width,
      height: size.height,
      frames: 1,
      quality: formatInfo[options.format].lossy && !lossless ? options.quality : null,
      lossless,
      scale: 1,
      engine: "browser",
      attempts: 1,
      targetMet: null,
      largerThanOriginal: blob.size >= source.bytes,
      explanation: null,
      suggestion: null,
    };
  } finally {
    bitmap.close();
  }
}

export async function browserCompress(
  source: SourceImage,
  options: CompressOptions,
  signal: AbortSignal,
  onAttempt: (info: AttemptInfo) => void,
): Promise<ProcessResult> {
  const effective = compressionEncodeOptions(options);
  const bitmap = await decode(source);
  try {
    const base = sourceSize(source, bitmap);
    const outcome = await optimizeToTarget({
      encode: async ({ quality, scale }) => {
        const size = computeOutputDimensions(base, effective.resize, scale);
        const blob = await encodeBitmap(bitmap, size, effective, quality);
        return { size: blob.size, blob, dimensions: size };
      },
      mode: options.mode,
      targetBytes: options.targetBytes,
      originalBytes: source.bytes,
      preferredQuality: options.quality,
      allowResize: options.allowResize,
      lossless: isLosslessEncode(effective),
      signal,
      onAttempt,
    });
    const { best } = outcome;
    return {
      blob: best.blob,
      format: effective.format,
      width: best.dimensions.width,
      height: best.dimensions.height,
      frames: 1,
      quality: best.quality,
      lossless: false,
      scale: best.scale,
      engine: "browser",
      attempts: outcome.attempts,
      targetMet: outcome.targetMet,
      largerThanOriginal: outcome.largerThanOriginal,
      explanation: outcome.explanation,
      suggestion: outcome.suggestion,
    };
  } finally {
    bitmap.close();
  }
}
