import { AppError, errorCodes, type ApiErrorBody, type ErrorCode } from "@/lib/errors";
import { formatInfo, mimeToOutputFormat, type OutputFormat } from "./formats";
import type { CompressOptions, EncodeOptions } from "./schema";
import type { ProcessResult } from "./types";

function isApiError(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    !!error &&
    typeof error === "object" &&
    errorCodes.includes((error as { code: ErrorCode }).code) &&
    typeof (error as { message: unknown }).message === "string"
  );
}

const decodeHeader = (value: string | null) => {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const numberHeader = (headers: Headers, name: string) => {
  const value = Number(headers.get(name));
  return Number.isFinite(value) ? value : null;
};

/**
 * Sends one image to the Sharp API. The upload is processed in memory and never stored.
 * Responses are validated: the content type must match the requested format.
 */
export async function processOnServer(
  kind: "convert" | "compress",
  file: File,
  options: EncodeOptions | CompressOptions,
  signal: AbortSignal,
): Promise<ProcessResult> {
  const body = new FormData();
  body.set("file", file, file.name);
  body.set("options", JSON.stringify(options));

  let response: Response;
  try {
    response = await fetch(`/api/image/${kind}`, { method: "POST", body, signal, cache: "no-store" });
  } catch (error) {
    if (signal.aborted) throw new AppError("CANCELLED");
    throw new AppError("NETWORK_ERROR", undefined, { cause: error });
  }

  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    if (isApiError(json)) throw new AppError(json.error.code, json.error.message, { field: json.error.field });
    if (response.status === 413) throw new AppError("PAYLOAD_TOO_LARGE");
    throw new AppError("UNEXPECTED_RESPONSE");
  }

  const format = mimeToOutputFormat(response.headers.get("content-type") ?? "");
  if (format !== options.format) {
    throw new AppError("UNEXPECTED_RESPONSE", "The server returned a different format than requested.");
  }
  const blob = await response.blob();
  const headers = response.headers;
  const targetHeader = headers.get("x-image-target-met");
  return {
    blob: blob.type === formatInfo[format].mime ? blob : new Blob([blob], { type: formatInfo[format].mime }),
    format: format as OutputFormat,
    width: numberHeader(headers, "x-image-width") ?? 0,
    height: numberHeader(headers, "x-image-height") ?? 0,
    frames: numberHeader(headers, "x-image-frames") ?? 1,
    quality: headers.get("x-image-quality") ? numberHeader(headers, "x-image-quality") : null,
    lossless: headers.get("x-image-lossless") === "true",
    scale: numberHeader(headers, "x-image-scale") ?? 1,
    engine: "server",
    attempts: numberHeader(headers, "x-image-attempts") ?? 1,
    targetMet: targetHeader === "true" ? true : targetHeader === "false" ? false : null,
    largerThanOriginal: headers.get("x-image-larger-than-original") === "true" || blob.size >= file.size,
    explanation: decodeHeader(headers.get("x-image-explanation")),
    suggestion: decodeHeader(headers.get("x-image-suggestion")),
  };
}
