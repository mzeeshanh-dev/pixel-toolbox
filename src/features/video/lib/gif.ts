/** Minimal GIF inspection used to verify encoder output without trusting it blindly. */

export function isGif(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  return signature === "GIF89a" || signature === "GIF87a";
}

export function gifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isGif(bytes)) return null;
  return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
}

function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  let position = offset;
  while (position < bytes.length) {
    const size = bytes[position];
    position += 1;
    if (size === 0) return position;
    position += size;
  }
  return -1;
}

/** Counts image frames by walking the GIF block structure. Returns null if malformed. */
export function countGifFrames(bytes: Uint8Array): number | null {
  if (!isGif(bytes)) return null;
  let position = 13;
  const flags = bytes[10];
  if (flags & 0x80) position += 3 * (1 << ((flags & 0x07) + 1));
  let frames = 0;
  while (position < bytes.length) {
    const block = bytes[position];
    if (block === 0x3b) return frames; // trailer
    if (block === 0x21) {
      position = skipSubBlocks(bytes, position + 2);
    } else if (block === 0x2c) {
      frames += 1;
      const localFlags = bytes[position + 9];
      position += 10;
      if (localFlags & 0x80) position += 3 * (1 << ((localFlags & 0x07) + 1));
      position = skipSubBlocks(bytes, position + 1); // +1 skips LZW minimum code size
    } else {
      return null;
    }
    if (position < 0) return null;
  }
  return null;
}
