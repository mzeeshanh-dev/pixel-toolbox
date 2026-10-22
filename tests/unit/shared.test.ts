import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FFMPEG_CORE_VERSION, ffmpegAssets } from "@/config/ffmpeg";
import { AppError, toUserError } from "@/lib/errors";
import { detectImageFormat, detectVideoContainer } from "@/lib/file-sniff";
import { formatBytes, percentChange } from "@/lib/format";
import { replaceExtension, sanitizeFilename } from "@/lib/download";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) => (typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value])),
  );

describe("file sniffing", () => {
  it("detects image formats from magic bytes, not extensions", () => {
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectImageFormat(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectImageFormat(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("webp");
    expect(detectImageFormat(bytes("GIF89a"))).toBe("gif");
    expect(detectImageFormat(bytes("II", 0x2a, 0))).toBe("tiff");
    expect(detectImageFormat(bytes(0, 0, 0, 0x1c, "ftypavif", 0, 0, 0, 0, "avifmif1"))).toBe("avif");
    expect(detectImageFormat(bytes(0, 0, 0, 0x18, "ftypheic", 0, 0, 0, 0, "mif1"))).toBe("heif");
    expect(detectImageFormat(bytes("hello world"))).toBeNull();
  });

  it("detects video containers", () => {
    expect(detectVideoContainer(bytes(0, 0, 0, 0x18, "ftypisom", 0, 0, 0, 0, "isomiso2"))).toBe("mp4");
    expect(detectVideoContainer(bytes(0, 0, 0, 0x14, "ftypqt  ", 0, 0, 0, 0))).toBe("mov");
    expect(detectVideoContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, "webm"))).toBe("webm");
    expect(detectVideoContainer(bytes(0, 0, 0, 0x1c, "ftypavif", 0, 0, 0, 0, "avifmif1"))).toBeNull();
    expect(detectVideoContainer(bytes("not a video at all"))).toBeNull();
  });
});

describe("formatting and filenames", () => {
  it("formats sizes in binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(percentChange(1000, 250)).toBe(75);
    expect(percentChange(1000, 1200)).toBe(-20);
  });

  it("sanitises download names", () => {
    expect(sanitizeFilename('a/b:c*?"<>|.png')).toBe("a-b-c-.png");
    expect(sanitizeFilename("...")).toBe("download");
    expect(replaceExtension("holiday clip.mov", "gif")).toBe("holiday clip.gif");
  });
});

describe("errors", () => {
  it("maps unknown errors to safe messages without internals", () => {
    const internal = new Error("ENOENT /var/task/secret/path");
    const mapped = toUserError(internal);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("/var/task");
    expect(toUserError(new AppError("FILE_TOO_LARGE", "Too big")).message).toBe("Too big");
    expect(toUserError(new DOMException("x", "QuotaExceededError")).code).toBe("QUOTA_EXCEEDED");
  });
});

describe("ffmpeg asset config", () => {
  it("matches the installed @ffmpeg/core version so production URLs resolve", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "node_modules", "@ffmpeg", "core", "package.json"), "utf8"),
    ) as { version: string };
    expect(FFMPEG_CORE_VERSION).toBe(pkg.version);
    expect(ffmpegAssets.wasm).toBe(`/vendor/ffmpeg/${pkg.version}/ffmpeg-core.wasm`);
  });
});
