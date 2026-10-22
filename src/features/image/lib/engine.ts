import { imageLimits } from "@/config/limits";
import { formatBytes } from "@/lib/format";
import { formatInfo, serverDecodableFormats, type InputFormat, type OutputFormat } from "./formats";
import type { CompressOptions, EncodeOptions } from "./schema";

export interface EngineSource {
  format: InputFormat;
  bytes: number;
  animated: boolean;
  /** Result of an actual createImageBitmap attempt in this browser. */
  browserCanDecode: boolean;
}

export interface EngineCapabilities {
  /** Output formats this browser's canvas actually encodes (verified at runtime). */
  browserEncodes: readonly OutputFormat[];
}

export type EngineDecision =
  | { kind: "ready"; engine: "browser" | "server"; reasons: string[]; preservesAnimation: boolean }
  | { kind: "needs-consent"; message: string }
  | { kind: "unavailable"; code: "FILE_TOO_LARGE" | "UNSUPPORTED_FORMAT"; message: string };

type Operation = { type: "convert"; options: EncodeOptions } | { type: "compress"; options: CompressOptions };

/** Settings that only the Sharp encoder can honour. */
export function serverOnlyReasons(operation: Operation): string[] {
  const { options } = operation;
  const reasons: string[] = [];
  const label = formatInfo[options.format].label;
  if (options.format === "avif" || options.format === "tiff" || options.format === "gif") {
    reasons.push(`${label} output`);
  }
  if (options.format === "jpeg") {
    if (options.chromaSubsampling === "4:4:4") reasons.push("4:4:4 chroma subsampling");
    if (options.progressive) reasons.push("progressive JPEG");
  }
  if (options.format === "png") {
    if (options.pngPalette) reasons.push("PNG colour reduction");
    if (operation.type === "convert" && options.pngCompressionLevel !== 6) reasons.push("PNG compression level");
    // The browser's PNG encoder is not tuned; real lossless optimisation needs Sharp.
    if (operation.type === "compress") reasons.push("PNG optimisation");
  }
  if (options.format === "webp" && options.webpLossless) reasons.push("lossless WebP");
  return reasons;
}

/**
 * Decides where an operation runs. Browser first; the server is used only when the
 * format or an option requires Sharp, and only within the serverless upload limit.
 */
export function chooseEngine(source: EngineSource, operation: Operation, caps: EngineCapabilities): EngineDecision {
  const { options } = operation;
  const output = options.format;
  const serverLimit = formatBytes(imageLimits.maxServerInputBytes, 0);
  const label = formatInfo[output].label;

  if (source.animated && !options.firstFrameOnly) {
    if (!formatInfo[output].animation || operation.type === "compress") {
      return {
        kind: "needs-consent",
        message: `This image is animated and ${label} ${
          formatInfo[output].animation ? "compression here" : "output"
        } keeps a single frame. Confirm “Convert first frame only”, or choose WebP or GIF in Convert mode to keep the animation.`,
      };
    }
    // Animation preservation always needs Sharp.
    if (!serverDecodableFormats.includes(source.format)) {
      return { kind: "unavailable", code: "UNSUPPORTED_FORMAT", message: "This animated image cannot be processed." };
    }
    if (source.bytes > imageLimits.maxServerInputBytes) {
      return {
        kind: "unavailable",
        code: "FILE_TOO_LARGE",
        message: `Keeping the animation needs the server, which accepts files up to ${serverLimit}. Tick “Convert first frame only” to process it in your browser, or use a smaller file.`,
      };
    }
    return { kind: "ready", engine: "server", reasons: ["animation is preserved"], preservesAnimation: true };
  }

  const reasons = serverOnlyReasons(operation);
  if (!source.browserCanDecode) reasons.push(`${source.format.toUpperCase()} input`);
  if (!caps.browserEncodes.includes(output) && !reasons.some((reason) => reason.startsWith(label))) {
    reasons.push(`${label} encoding is not supported by this browser`);
  }

  if (reasons.length === 0) {
    return { kind: "ready", engine: "browser", reasons: [], preservesAnimation: false };
  }

  if (!serverDecodableFormats.includes(source.format)) {
    return {
      kind: "unavailable",
      code: "UNSUPPORTED_FORMAT",
      message: `${reasons[0]} needs the server, which cannot read ${source.format.toUpperCase()} files. Choose JPEG, PNG or WebP with default options.`,
    };
  }

  if (source.bytes > imageLimits.maxServerInputBytes) {
    const what = reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1);
    const browserAlternative = source.browserCanDecode
      ? " Choose JPEG, PNG or WebP with default options to process this file in your browser, or use a smaller file."
      : " Use a smaller file.";
    return {
      kind: "unavailable",
      code: "FILE_TOO_LARGE",
      message: `${what} needs the server, which accepts files up to ${serverLimit}.${browserAlternative}`,
    };
  }

  return { kind: "ready", engine: "server", reasons, preservesAnimation: false };
}
