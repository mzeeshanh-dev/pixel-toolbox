import { videoLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { detectImageFormat, detectVideoContainer, readHeader, type VideoContainer } from "@/lib/file-sniff";
import { formatBytes, formatDuration } from "@/lib/format";

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  container: VideoContainer;
  codec?: string;
  /** Whether this browser can play the file (affects the preview only). */
  previewable: boolean;
}

export const DECODE_FAILED_MESSAGE = "The file could not be decoded. Try exporting it as MP4 or WebM.";

const containerExtensions: Record<VideoContainer, string> = {
  mp4: "mp4",
  mov: "mov",
  webm: "webm",
  matroska: "mkv",
  avi: "avi",
  ogg: "ogv",
  "mpeg-ts": "ts",
  "3gp": "3gp",
};

export function inputFileName(container: VideoContainer): string {
  return `input.${containerExtensions[container]}`;
}

/** Step 1 + 2: size and actual content. Extension and MIME type are only hints. */
export function validateFileBasics(file: { size: number }, header: Uint8Array): VideoContainer {
  if (file.size === 0) throw new AppError("INVALID_FILE", "The selected file is empty.");
  if (file.size > videoLimits.maxInputBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `The selected video exceeds the current ${formatBytes(videoLimits.maxInputBytes, 0)} limit.`,
    );
  }
  const container = detectVideoContainer(header);
  if (container) return container;
  if (detectImageFormat(header)) {
    throw new AppError(
      "UNSUPPORTED_FORMAT",
      "This file is an image, not a video. Use the Image Converter for still images.",
    );
  }
  throw new AppError(
    "UNSUPPORTED_FORMAT",
    "This file is not a recognised video format. Try exporting it as MP4 or WebM.",
  );
}

/** Step 3: limits that depend on decoded metadata. */
export function validateMetadata(meta: { duration: number; width: number; height: number }): void {
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
    throw new AppError("DECODE_FAILED", DECODE_FAILED_MESSAGE);
  }
  if (!meta.width || !meta.height || meta.width < 2 || meta.height < 2) {
    throw new AppError("DECODE_FAILED", "No playable video stream was found in this file.");
  }
  if (meta.duration > videoLimits.maxDurationSeconds + 0.05) {
    throw new AppError(
      "DURATION_TOO_LONG",
      `This video is ${formatDuration(meta.duration)} long. The current limit is ${formatDuration(videoLimits.maxDurationSeconds)} — trim it in a video editor first.`,
    );
  }
  if (meta.width * meta.height > videoLimits.maxSourcePixels) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      `The video resolution (${meta.width} × ${meta.height}) is above the 4K limit for in-browser conversion.`,
    );
  }
}

export interface ParsedProbe {
  duration: number | null;
  video: { codec: string; width: number; height: number } | null;
}

/** Parses `ffmpeg -i input` stderr output into duration and first video stream. */
export function parseProbeLog(lines: readonly string[]): ParsedProbe {
  let duration: number | null = null;
  let video: ParsedProbe["video"] = null;
  for (const line of lines) {
    const durationMatch = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
    if (durationMatch && duration === null) {
      duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
    }
    if (!video) {
      const streamMatch = /Stream #\d+:\d+.*?:\s*Video:\s*([\w-]+)/.exec(line);
      if (streamMatch) {
        const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(line.slice(streamMatch.index + streamMatch[0].length));
        if (size) video = { codec: streamMatch[1], width: Number(size[1]), height: Number(size[2]) };
      }
    }
  }
  return { duration, video };
}

/** Parses an FFmpeg progress line (`time=00:00:01.23`) into seconds. */
export function parseLogTime(line: string): number | null {
  const match = /time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/**
 * Browser metadata probe using a detached <video> element. Returns null when this
 * browser cannot decode the file (FFmpeg is then used as a fallback probe).
 */
export function browserProbe(file: Blob, timeoutMs = 10_000): Promise<{ duration: number; width: number; height: number } | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value: { duration: number; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    const report = () => {
      if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) return finish(null);
      finish({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
    };
    video.preload = "metadata";
    video.muted = true;
    video.addEventListener("error", () => finish(null));
    video.addEventListener("loadedmetadata", () => {
      if (video.duration === Infinity) {
        // Streamed WebM (e.g. MediaRecorder output) has no duration header; seeking
        // far ahead makes the browser scan the file and report the real duration.
        video.addEventListener("durationchange", () => Number.isFinite(video.duration) && report());
        video.currentTime = 1e7;
        return;
      }
      report();
    });
    video.src = url;
  });
}

export { readHeader };
