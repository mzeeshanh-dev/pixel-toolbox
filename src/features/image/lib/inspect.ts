/**
 * Pure byte-level inspection: dimensions, animation and alpha hints read from file
 * headers without decoding pixels. Used to reject decompression bombs early and to
 * make the animated-image policy explicit. Works in browsers and Node.
 */
import type { InputFormat } from "./formats";

export interface HeaderInfo {
  width: number | null;
  height: number | null;
  animated: boolean;
  frames: number | null;
  /** True when the format declares an alpha channel / transparency. */
  alpha: boolean | null;
}

const ascii = (bytes: Uint8Array, start: number, length: number) => {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);

const empty: HeaderInfo = { width: null, height: null, animated: false, frames: null, alpha: null };

/** Counts GIF frames by walking the block structure. Stops early after `limit` frames. */
export function inspectGif(bytes: Uint8Array, limit = 10_000): HeaderInfo {
  if (bytes.length < 13) return empty;
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  let offset = 13;
  const packed = bytes[10];
  if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
  let frames = 0;
  let alpha = false;
  const skipSubBlocks = () => {
    while (offset < bytes.length) {
      const size = bytes[offset];
      offset += 1;
      if (size === 0) return;
      offset += size;
    }
  };
  while (offset < bytes.length && frames < limit) {
    const block = bytes[offset];
    if (block === 0x2c) {
      frames += 1;
      const localPacked = bytes[offset + 9];
      offset += 10;
      if (localPacked & 0x80) offset += 3 * (1 << ((localPacked & 0x07) + 1));
      offset += 1; // LZW minimum code size
      skipSubBlocks();
    } else if (block === 0x21) {
      if (bytes[offset + 1] === 0xf9 && bytes[offset + 3] & 0x01) alpha = true;
      offset += 2;
      skipSubBlocks();
    } else {
      break; // 0x3b trailer or corrupt data
    }
  }
  return { width, height, animated: frames > 1, frames, alpha };
}

export function inspectPng(bytes: Uint8Array): HeaderInfo {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== "IHDR") return empty;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  const colorType = bytes[25];
  let alpha = colorType === 4 || colorType === 6;
  let animated = false;
  let frames: number | null = 1;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL" && offset + 12 <= bytes.length) {
      frames = u32be(bytes, offset + 8);
      animated = frames > 1;
    }
    if (type === "tRNS") alpha = true;
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length;
  }
  return { width, height, animated, frames, alpha };
}

export function inspectWebp(bytes: Uint8Array): HeaderInfo {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return empty;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    const flags = bytes[20];
    const width = u24le(bytes, 24) + 1;
    const height = u24le(bytes, 27) + 1;
    const animatedFlag = (flags & 0x02) !== 0;
    let frames = 0;
    let offset = 12;
    while (animatedFlag && offset + 8 <= bytes.length) {
      if (ascii(bytes, offset, 4) === "ANMF") frames += 1;
      const size = u32le(bytes, offset + 4);
      offset += 8 + size + (size % 2);
    }
    return {
      width,
      height,
      animated: animatedFlag && frames !== 1,
      frames: animatedFlag ? frames || null : 1,
      alpha: (flags & 0x10) !== 0,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = u32le(bytes, 21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
      animated: false,
      frames: 1,
      alpha: ((bits >>> 28) & 1) === 1,
    };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff, animated: false, frames: 1, alpha: false };
  }
  return empty;
}

export function inspectJpeg(bytes: Uint8Array): HeaderInfo {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = u16be(bytes, offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { width: u16be(bytes, offset + 7), height: u16be(bytes, offset + 5), animated: false, frames: 1, alpha: false };
    }
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  return { ...empty, frames: 1, alpha: false };
}

export function inspectBmp(bytes: Uint8Array): HeaderInfo {
  if (bytes.length < 26) return empty;
  const width = Math.abs(u32le(bytes, 18) | 0);
  const height = Math.abs(u32le(bytes, 22) | 0);
  return { width, height, animated: false, frames: 1, alpha: null };
}

export function inspectImage(bytes: Uint8Array, format: InputFormat): HeaderInfo {
  switch (format) {
    case "gif":
      return inspectGif(bytes);
    case "png":
      return inspectPng(bytes);
    case "webp":
      return inspectWebp(bytes);
    case "jpeg":
      return inspectJpeg(bytes);
    case "bmp":
      return inspectBmp(bytes);
    default:
      // AVIF/TIFF: dimensions come from the decoder (browser bitmap or Sharp metadata).
      return empty;
  }
}
