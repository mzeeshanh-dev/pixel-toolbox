/**
 * Content sniffing from magic bytes. File extensions and MIME types are only
 * hints; these helpers look at the actual bytes. Works in browsers and Node.
 */

export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "avif" | "heif" | "tiff" | "bmp" | "svg";
export type VideoContainer = "mp4" | "mov" | "webm" | "matroska" | "avi" | "ogg" | "mpeg-ts" | "3gp";

/** How many leading bytes the sniffers need. */
export const SNIFF_BYTES = 64;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** ISO-BMFF major + compatible brands (MP4, MOV, AVIF, HEIF, 3GP). */
function isoBrands(bytes: Uint8Array): string[] | null {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const boxSize = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const end = Math.min(boxSize > 0 ? boxSize : bytes.length, bytes.length);
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(bytes, offset, 4));
  return brands;
}

export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "gif";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (ascii(bytes, 0, 2) === "BM" && bytes.length >= 14) return "bmp";
  const brands = isoBrands(bytes);
  if (brands) {
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand))) return "heif";
  }
  const head = ascii(bytes, 0, Math.min(bytes.length, SNIFF_BYTES)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

export function detectVideoContainer(bytes: Uint8Array): VideoContainer | null {
  const brands = isoBrands(bytes);
  if (brands) {
    if (brands[0] === "qt  ") return "mov";
    if (brands[0].startsWith("3g")) return "3gp";
    if (brands.some((brand) => brand === "avif" || brand === "avis" || brand === "heic" || brand === "mif1")) {
      return null;
    }
    return "mp4";
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    // EBML header; WebM declares its DocType early in the header.
    return ascii(bytes, 0, Math.min(bytes.length, SNIFF_BYTES)).includes("webm") ? "webm" : "matroska";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "AVI ") return "avi";
  if (ascii(bytes, 0, 4) === "OggS") return "ogg";
  if (bytes[0] === 0x47 && bytes.length > 188 && bytes[188] === 0x47) return "mpeg-ts";
  // QuickTime files without ftyp start with moov/mdat/wide/free atoms.
  if (["moov", "mdat", "wide", "free", "skip"].includes(ascii(bytes, 4, 4))) return "mov";
  return null;
}

export async function readHeader(file: Blob, length = 512): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

export const imageMimeTypes: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heif: "image/heif",
  tiff: "image/tiff",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};
