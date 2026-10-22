import type { DitherMode, EncodeParams } from "@/features/video/lib/settings";

export interface ClipWindow {
  start: number;
  duration: number;
}

function seconds(value: number): string {
  return Math.max(0, value).toFixed(3);
}

function ditherFilter(dither: DitherMode): string {
  switch (dither) {
    case "sierra2_4a":
      return "dither=sierra2_4a";
    case "bayer3":
      return "dither=bayer:bayer_scale=3";
    case "bayer5":
      return "dither=bayer:bayer_scale=5";
    case "none":
      return "dither=none";
  }
}

/** fps + Lanczos scale; height -2 keeps the aspect ratio with an even height. */
export function scaleChain(params: Pick<EncodeParams, "fps" | "width" | "height">): string {
  return `fps=${params.fps},scale=${params.width}:${params.height ?? -2}:flags=lanczos`;
}

/** Pass 1: build an optimal palette for this exact frame rate and size. */
export function paletteArgs(input: string, palette: string, clip: ClipWindow, params: EncodeParams): string[] {
  return [
    "-hide_banner",
    "-ss",
    seconds(clip.start),
    "-t",
    seconds(clip.duration),
    "-i",
    input,
    "-vf",
    `${scaleChain(params)},palettegen=stats_mode=${params.statsMode}:max_colors=${params.maxColors}`,
    // Skip audio/subtitle decoding: it only costs time, especially on long clips.
    "-an",
    "-sn",
    "-y",
    palette,
  ];
}

/** Pass 2: map frames onto the palette and write an infinitely looping GIF. */
export function encodeArgs(
  input: string,
  palette: string,
  output: string,
  clip: ClipWindow,
  params: EncodeParams,
): string[] {
  const diffMode = params.statsMode === "diff" ? ":diff_mode=rectangle" : "";
  return [
    "-hide_banner",
    "-ss",
    seconds(clip.start),
    "-t",
    seconds(clip.duration),
    "-i",
    input,
    "-i",
    palette,
    "-lavfi",
    `${scaleChain(params)}[x];[x][1:v]paletteuse=${ditherFilter(params.dither)}${diffMode}`,
    "-an",
    "-loop",
    "0",
    "-f",
    "gif",
    "-y",
    output,
  ];
}

export function probeArgs(input: string): string[] {
  return ["-hide_banner", "-i", input];
}
