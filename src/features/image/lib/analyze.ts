import { imageLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { detectImageFormat } from "@/lib/file-sniff";
import { formatBytes } from "@/lib/format";
import { browserEncodableFormats, isInputFormat, type InputFormat, type OutputFormat } from "./formats";
import { inspectImage } from "./inspect";

export interface SourceImage {
  file: File;
  format: InputFormat;
  bytes: number;
  width: number | null;
  height: number | null;
  animated: boolean;
  frames: number | null;
  alpha: boolean | null;
  browserCanDecode: boolean;
}

/** Formats every modern browser decodes; a decode failure here means a damaged file. */
const alwaysDecodable: readonly InputFormat[] = ["jpeg", "png", "gif", "webp", "bmp"];

/**
 * Validates and describes a user-selected image using its actual bytes: format from
 * magic bytes, dimensions from headers (checked before decoding), animation and
 * transparency hints, and whether this browser can decode it.
 */
export async function analyzeImage(file: File): Promise<SourceImage> {
  if (file.size === 0) throw new AppError("INVALID_FILE", "The selected file is empty.");
  if (file.size > imageLimits.maxBrowserInputBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `The selected image is ${formatBytes(file.size)}, above the ${formatBytes(imageLimits.maxBrowserInputBytes, 0)} limit.`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    throw new AppError("INVALID_FILE", "The selected file could not be read.", { cause: error });
  }

  const detected = detectImageFormat(bytes.subarray(0, 512));
  if (detected === "svg") {
    throw new AppError("UNSUPPORTED_FORMAT", "SVG files are not supported. Export the graphic as PNG first.");
  }
  if (detected === "heif") {
    throw new AppError("UNSUPPORTED_FORMAT", "HEIC/HEIF photos are not supported. Export the photo as JPEG first.");
  }
  if (!isInputFormat(detected)) {
    throw new AppError(
      "UNSUPPORTED_FORMAT",
      "This file is not a supported image. Use JPEG, PNG, WebP, GIF, AVIF, TIFF or BMP.",
    );
  }

  const header = inspectImage(bytes, detected);
  const tooManyPixels = (width: number | null, height: number | null) =>
    width !== null && height !== null && width * height > imageLimits.maxInputPixels;
  if (tooManyPixels(header.width, header.height)) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      `The image is ${header.width} × ${header.height} pixels, above the ${Math.round(imageLimits.maxInputPixels / 1e6)} megapixel safety limit.`,
    );
  }
  if (header.frames !== null && header.frames > imageLimits.maxAnimationFrames) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      `Animated images are limited to ${imageLimits.maxAnimationFrames} frames; this one has ${header.frames}.`,
    );
  }

  let width = header.width;
  let height = header.height;
  let browserCanDecode = false;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
    browserCanDecode = true;
  } catch {
    browserCanDecode = false;
  }

  if (!browserCanDecode && alwaysDecodable.includes(detected)) {
    throw new AppError("DECODE_FAILED", "The image could not be decoded. The file may be damaged or incomplete.");
  }
  if (tooManyPixels(width, height)) {
    throw new AppError("DIMENSIONS_TOO_LARGE", "The image has too many pixels to process safely.");
  }

  return {
    file,
    format: detected,
    bytes: file.size,
    width,
    height,
    animated: header.animated,
    frames: header.frames,
    alpha: header.alpha,
    browserCanDecode,
  };
}

let encodersPromise: Promise<OutputFormat[]> | null = null;

/** Detects which formats this browser's canvas really encodes (Safari may lack WebP). */
export function detectBrowserEncoders(): Promise<OutputFormat[]> {
  encodersPromise ??= (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const supported: OutputFormat[] = [];
    for (const format of browserEncodableFormats) {
      const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.8));
      if (blob?.type === mime) supported.push(format);
    }
    canvas.width = 0;
    canvas.height = 0;
    return supported;
  })();
  return encodersPromise;
}
