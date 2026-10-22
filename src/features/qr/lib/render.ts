import { create } from "qrcode";
import { qrLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import type { ErrorCorrectionLevel, QrStyle } from "@/lib/db";
import { normalizeHex } from "./colors";

export interface QrRenderConfig extends QrStyle {
  content: string;
}

export interface QrMatrix {
  /** Modules per side, excluding the margin. */
  size: number;
  version: number;
  /** Row-major, 1 = dark module. */
  dark: Uint8Array;
}

/** Small LRU cache built on Map insertion order. */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly capacity: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

const matrixCache = new LruCache<string, QrMatrix>(qrLimits.previewCacheEntries);
const svgCache = new LruCache<string, string>(qrLimits.previewCacheEntries);

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Builds (or reuses) the module matrix. Throws an AppError on capacity overflow. */
export function getMatrix(content: string, level: ErrorCorrectionLevel): QrMatrix {
  const key = `${level}\u0000${content}`;
  const cached = matrixCache.get(key);
  if (cached) return cached;
  if (!content) throw new AppError("INVALID_SETTINGS", "Enter some content to encode.", { field: "content" });
  if (utf8Length(content) > qrLimits.maxContentBytes) {
    throw new AppError(
      "INVALID_SETTINGS",
      `Content is too long. The maximum is ${qrLimits.maxContentBytes.toLocaleString("en")} bytes.`,
      { field: "content" },
    );
  }
  try {
    const qr = create(content, { errorCorrectionLevel: level });
    const matrix: QrMatrix = {
      size: qr.modules.size,
      version: qr.version,
      dark: Uint8Array.from(qr.modules.data, (value) => (value ? 1 : 0)),
    };
    matrixCache.set(key, matrix);
    return matrix;
  } catch (error) {
    throw new AppError(
      "INVALID_SETTINGS",
      `Too much content for error correction level ${level}. Shorten it or choose a lower level (L holds the most).`,
      { field: "content", cause: error },
    );
  }
}

export function configKey(config: QrRenderConfig): string {
  return [
    config.content,
    config.errorCorrectionLevel,
    config.margin,
    normalizeHex(config.foregroundColor),
    normalizeHex(config.backgroundColor),
    config.transparentBackground ? "t" : "o",
  ].join("\u0000");
}

function resolveColors(config: QrRenderConfig) {
  const foreground = normalizeHex(config.foregroundColor);
  const background = normalizeHex(config.backgroundColor);
  if (!foreground) throw new AppError("INVALID_SETTINGS", "Enter a valid foreground HEX colour.", { field: "foregroundColor" });
  if (!background && !config.transparentBackground) {
    throw new AppError("INVALID_SETTINGS", "Enter a valid background HEX colour.", { field: "backgroundColor" });
  }
  return { foreground, background };
}

function clampMargin(margin: number): number {
  return Math.min(qrLimits.maxMargin, Math.max(qrLimits.minMargin, Math.round(margin)));
}

/**
 * Renders a standalone SVG document. The markup is generated entirely from the
 * module matrix and validated colours — no user text is ever embedded in it.
 */
export function renderSvg(config: QrRenderConfig): string {
  const key = configKey(config);
  const cached = svgCache.get(key);
  if (cached) return cached;

  const { foreground, background } = resolveColors(config);
  const matrix = getMatrix(config.content, config.errorCorrectionLevel);
  const margin = clampMargin(config.margin);
  const total = matrix.size + margin * 2;

  let path = "";
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.dark[row * matrix.size + col]) {
        col += 1;
        continue;
      }
      // Merge horizontal runs of dark modules into one rectangle.
      let run = 1;
      while (col + run < matrix.size && matrix.dark[row * matrix.size + col + run]) run += 1;
      path += `M${col + margin} ${row + margin}h${run}v1h-${run}z`;
      col += run;
    }
  }

  const backgroundRect =
    config.transparentBackground || !background ? "" : `<rect width="${total}" height="${total}" fill="${background}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 8}" height="${total * 8}" shape-rendering="crispEdges">` +
    `${backgroundRect}<path fill="${foreground}" d="${path}"/></svg>`;
  svgCache.set(key, svg);
  return svg;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Convenience for previews: returns a data URL, or an error message. */
export function tryRenderDataUrl(config: QrRenderConfig): { url: string; matrix: QrMatrix } | { error: AppError } {
  try {
    const svg = renderSvg(config);
    return { url: svgToDataUrl(svg), matrix: getMatrix(config.content, config.errorCorrectionLevel) };
  } catch (error) {
    return { error: error instanceof AppError ? error : new AppError("INTERNAL_ERROR") };
  }
}

/** Pixel size of a PNG export: an integer number of pixels per module, closest to the requested size. */
export function pngDimensions(config: QrRenderConfig, requestedSize: number) {
  const matrix = getMatrix(config.content, config.errorCorrectionLevel);
  const total = matrix.size + clampMargin(config.margin) * 2;
  const target = Math.min(qrLimits.maxExportSize, Math.max(qrLimits.minExportSize, requestedSize));
  const scale = Math.max(1, Math.round(target / total));
  return { total, scale, pixels: total * scale };
}

/**
 * Renders a PNG. With a transparent background the canvas is never filled, so the
 * exported pixels outside dark modules have alpha 0 (real transparency).
 */
export async function renderPngBlob(config: QrRenderConfig, requestedSize: number): Promise<{ blob: Blob; size: number }> {
  const { foreground, background } = resolveColors(config);
  const matrix = getMatrix(config.content, config.errorCorrectionLevel);
  const margin = clampMargin(config.margin);
  const { scale, pixels } = pngDimensions(config, requestedSize);

  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (!context) throw new AppError("ENCODE_FAILED", "This browser could not create an image canvas.");

  context.clearRect(0, 0, pixels, pixels);
  if (!config.transparentBackground && background) {
    context.fillStyle = background;
    context.fillRect(0, 0, pixels, pixels);
  }
  context.fillStyle = foreground;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.dark[row * matrix.size + col]) {
        context.fillRect((col + margin) * scale, (row + margin) * scale, scale, scale);
      }
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new AppError("ENCODE_FAILED", "The PNG could not be generated.");
  return { blob, size: pixels };
}

export function svgBlob(config: QrRenderConfig): Blob {
  return new Blob([renderSvg(config)], { type: "image/svg+xml" });
}

/** Test helper. */
export function clearRenderCaches(): void {
  matrixCache.clear();
  svgCache.clear();
}
