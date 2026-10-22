import { imageLimits } from "@/config/limits";
import type { ResizeOptions } from "./schema";

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * Computes output dimensions for the resize settings, then applies an extra `scale`
 * (used by target-size search). Never upscales unless `allowUpscale` is set.
 */
export function computeOutputDimensions(source: Dimensions, resize: ResizeOptions, scale = 1): Dimensions {
  let width = source.width;
  let height = source.height;

  if (resize.mode === "max" && resize.maxDimension) {
    const longest = Math.max(source.width, source.height);
    const factor = resize.maxDimension / longest;
    if (factor < 1 || resize.allowUpscale) {
      width = source.width * factor;
      height = source.height * factor;
    }
  } else if (resize.mode === "exact" && (resize.width || resize.height)) {
    const w = resize.width;
    const h = resize.height;
    if (w && h && !resize.keepAspect) {
      width = resize.allowUpscale ? w : Math.min(w, source.width);
      height = resize.allowUpscale ? h : Math.min(h, source.height);
    } else {
      // Keep aspect: fit inside the requested box (either side may be omitted).
      const factors = [w ? w / source.width : Infinity, h ? h / source.height : Infinity];
      let factor = Math.min(...factors);
      if (!resize.allowUpscale) factor = Math.min(factor, 1);
      width = source.width * factor;
      height = source.height * factor;
    }
  }

  width *= scale;
  height *= scale;

  const max = imageLimits.maxOutputDimension;
  if (width > max || height > max) {
    const factor = Math.min(max / width, max / height);
    width *= factor;
    height *= factor;
  }

  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}
