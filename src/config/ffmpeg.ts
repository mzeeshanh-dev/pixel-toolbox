/** Must match the installed @ffmpeg/core version (verified by a unit test). */
export const FFMPEG_CORE_VERSION = "0.12.10";

/** Same-origin static path populated by scripts/copy-ffmpeg-assets.mjs. */
export const ffmpegAssetBase =
  process.env.NEXT_PUBLIC_FFMPEG_BASE_URL ?? `/vendor/ffmpeg/${FFMPEG_CORE_VERSION}`;

export const ffmpegAssets = {
  module: `${ffmpegAssetBase}/esm/index.js`,
  core: `${ffmpegAssetBase}/ffmpeg-core.js`,
  wasm: `${ffmpegAssetBase}/ffmpeg-core.wasm`,
} as const;
