/**
 * HTTP boundary helpers for the image API: bounded body reading, structured JSON
 * errors and binary image responses. Never import from client code.
 */
import "server-only";
import type { z } from "zod";
import { imageLimits } from "@/config/limits";
import { AppError, httpStatusByCode, toUserError, type ApiErrorBody } from "@/lib/errors";
import { replaceExtension } from "@/lib/download";
import { formatBytes } from "@/lib/format";
import { fieldErrors } from "@/features/image/lib/schema";
import type { ImageResult } from "./sharp-service";

/** Room for multipart boundaries, headers and the JSON options field. */
const MULTIPART_OVERHEAD = 64 * 1024;
export const maxRequestBytes = imageLimits.maxServerInputBytes + MULTIPART_OVERHEAD;

const noStore = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function errorResponse(error: unknown): Response {
  const userError = toUserError(error);
  const body: ApiErrorBody = { error: userError };
  return Response.json(body, { status: httpStatusByCode[userError.code], headers: noStore });
}

const tooLarge = () =>
  new AppError(
    "PAYLOAD_TOO_LARGE",
    `Server processing accepts images up to ${formatBytes(imageLimits.maxServerInputBytes, 0)}.`,
  );

/** Reads the body without ever buffering more than `limit` bytes, regardless of headers. */
async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export interface ParsedUpload<T> {
  file: Buffer;
  fileName: string;
  options: T;
}

/**
 * Validates and parses a multipart upload: `file` (the image) and `options` (JSON).
 * Content-Length is checked first for a cheap rejection, then enforced while streaming.
 */
export async function parseUpload<T>(request: Request, schema: z.ZodType<T>): Promise<ParsedUpload<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError("INVALID_SETTINGS", "Send the image as multipart/form-data.");
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxRequestBytes) throw tooLarge();

  const body = await readLimitedBody(request, maxRequestBytes);
  let form: FormData;
  try {
    form = await new Response(body as BodyInit, { headers: { "content-type": contentType } }).formData();
  } catch {
    throw new AppError("INVALID_SETTINGS", "The upload could not be read.");
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    throw new AppError("INVALID_FILE", "Attach an image in the “file” field.", { field: "file" });
  }
  if (file.size > imageLimits.maxServerInputBytes) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `Server processing accepts images up to ${formatBytes(imageLimits.maxServerInputBytes, 0)}.`,
    );
  }

  const rawOptions = form.get("options");
  let json: unknown;
  try {
    json = JSON.parse(typeof rawOptions === "string" ? rawOptions : "");
  } catch {
    throw new AppError("INVALID_SETTINGS", "The “options” field must be valid JSON.", { field: "options" });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const [field, message] = Object.entries(fieldErrors(parsed.error))[0] ?? ["options", "Invalid options."];
    throw new AppError("INVALID_SETTINGS", message, { field });
  }

  const fileName = "name" in file && typeof file.name === "string" && file.name ? file.name : "image";
  return { file: Buffer.from(await file.arrayBuffer()), fileName, options: parsed.data };
}

export interface ResultHeaders {
  attempts?: number;
  targetMet?: boolean | null;
  largerThanOriginal?: boolean;
  explanation?: string | null;
  suggestion?: string | null;
}

/** Binary image response. Metadata travels in X-Image-* headers (URI-encoded text). */
export function imageResponse(result: ImageResult, fileName: string, extra: ResultHeaders = {}): Response {
  if (result.size > imageLimits.maxServerResponseBytes) {
    return errorResponse(
      new AppError(
        "OUTPUT_TOO_LARGE",
        `The result is ${formatBytes(result.size)}, more than the server can return (${formatBytes(imageLimits.maxServerResponseBytes)}). Choose a smaller size, lower quality, or a more efficient format.`,
      ),
    );
  }
  const downloadName = replaceExtension(fileName, result.format === "jpeg" ? "jpg" : result.format);
  const headers = new Headers({
    ...noStore,
    "Content-Type": result.mime,
    "Content-Length": String(result.size),
    "Content-Disposition": `attachment; filename="${downloadName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    "X-Image-Format": result.format,
    "X-Image-Width": String(result.width),
    "X-Image-Height": String(result.height),
    "X-Image-Frames": String(result.frames),
    "X-Image-Quality": result.quality === null ? "" : String(result.quality),
    "X-Image-Lossless": String(result.lossless),
    "X-Image-Scale": String(result.scale),
  });
  if (extra.attempts !== undefined) headers.set("X-Image-Attempts", String(extra.attempts));
  if (extra.targetMet !== undefined) headers.set("X-Image-Target-Met", extra.targetMet === null ? "none" : String(extra.targetMet));
  if (extra.largerThanOriginal !== undefined) headers.set("X-Image-Larger-Than-Original", String(extra.largerThanOriginal));
  if (extra.explanation) headers.set("X-Image-Explanation", encodeURIComponent(extra.explanation));
  if (extra.suggestion) headers.set("X-Image-Suggestion", encodeURIComponent(extra.suggestion));
  return new Response(new Uint8Array(result.buffer), { status: 200, headers });
}
