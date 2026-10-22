import type { ImageFormat } from "@/lib/file-sniff";

/** Formats we can write. GIF output is only offered for animation-preserving conversions. */
export const outputFormats = ["jpeg", "png", "webp", "avif", "tiff", "gif"] as const;
export type OutputFormat = (typeof outputFormats)[number];

/** Formats we accept as input. HEIC/HEIF and SVG are deliberately not supported. */
export const inputFormats = ["jpeg", "png", "webp", "gif", "avif", "tiff", "bmp"] as const;
export type InputFormat = (typeof inputFormats)[number];

export function isInputFormat(format: ImageFormat | null): format is InputFormat {
  return format !== null && (inputFormats as readonly string[]).includes(format);
}

interface FormatInfo {
  label: string;
  mime: string;
  extension: string;
  /** Has a meaningful quality setting. */
  lossy: boolean;
  /** Can be written losslessly (PNG always, WebP/AVIF with a flag, TIFF with lzw/deflate). */
  losslessCapable: boolean;
  alpha: boolean;
  animation: boolean;
}

export const formatInfo: Record<OutputFormat, FormatInfo> = {
  jpeg: { label: "JPEG", mime: "image/jpeg", extension: "jpg", lossy: true, losslessCapable: false, alpha: false, animation: false },
  png: { label: "PNG", mime: "image/png", extension: "png", lossy: false, losslessCapable: true, alpha: true, animation: false },
  webp: { label: "WebP", mime: "image/webp", extension: "webp", lossy: true, losslessCapable: true, alpha: true, animation: true },
  avif: { label: "AVIF", mime: "image/avif", extension: "avif", lossy: true, losslessCapable: true, alpha: true, animation: false },
  tiff: { label: "TIFF", mime: "image/tiff", extension: "tiff", lossy: false, losslessCapable: true, alpha: true, animation: false },
  gif: { label: "GIF", mime: "image/gif", extension: "gif", lossy: false, losslessCapable: false, alpha: true, animation: true },
};

export const inputFormatLabels: Record<InputFormat, string> = {
  jpeg: "JPEG",
  png: "PNG",
  webp: "WebP",
  gif: "GIF",
  avif: "AVIF",
  tiff: "TIFF",
  bmp: "BMP",
};

/** Formats the Sharp build on the server can decode (no BMP in the prebuilt libvips). */
export const serverDecodableFormats: readonly InputFormat[] = ["jpeg", "png", "webp", "gif", "avif", "tiff"];

/** Formats browsers can encode through canvas (support is verified at runtime). */
export const browserEncodableFormats: readonly OutputFormat[] = ["jpeg", "png", "webp"];

export function mimeToOutputFormat(mime: string): OutputFormat | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  const entry = Object.entries(formatInfo).find(([, info]) => info.mime === base);
  return entry ? (entry[0] as OutputFormat) : null;
}

/** Closest output format for "keep original format" in compression. */
export function defaultOutputFor(input: InputFormat): OutputFormat {
  if (input === "jpeg" || input === "png" || input === "webp" || input === "avif" || input === "tiff" || input === "gif") {
    return input;
  }
  return "png";
}
