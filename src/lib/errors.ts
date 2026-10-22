/**
 * Shared error vocabulary for browser and server code. Messages are written for
 * end users; internal details (stack traces, library output) are never exposed.
 */
export const errorCodes = [
  "INVALID_FILE",
  "UNSUPPORTED_FORMAT",
  "FILE_TOO_LARGE",
  "DURATION_TOO_LONG",
  "DIMENSIONS_TOO_LARGE",
  "DECODE_FAILED",
  "INVALID_SETTINGS",
  "TARGET_UNREACHABLE",
  "OUTPUT_TOO_LARGE",
  "ENCODE_FAILED",
  "CANCELLED",
  "TIMEOUT",
  "BUSY",
  "WORKER_INIT_FAILED",
  "ASSET_LOAD_FAILED",
  "STORAGE_UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "NETWORK_ERROR",
  "UNEXPECTED_RESPONSE",
  "PAYLOAD_TOO_LARGE",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  /** Optional field the error belongs to, so the UI can show it beside the control. */
  readonly field?: string;

  constructor(code: ErrorCode, message?: string, options?: { field?: string; cause?: unknown }) {
    super(message || fallbackMessages[code], options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.field = options?.field;
  }
}

const fallbackMessages: Record<ErrorCode, string> = {
  INVALID_FILE: "The selected file could not be read.",
  UNSUPPORTED_FORMAT: "This file format is not supported.",
  FILE_TOO_LARGE: "The selected file is too large.",
  DURATION_TOO_LONG: "The selected video is too long.",
  DIMENSIONS_TOO_LARGE: "The image or video dimensions are too large.",
  DECODE_FAILED: "The file could not be decoded. It may be corrupted or use an unsupported codec.",
  INVALID_SETTINGS: "Some settings are invalid. Check the highlighted fields.",
  TARGET_UNREACHABLE: "The target size could not be reached with the current settings.",
  OUTPUT_TOO_LARGE: "The generated file is too large to return.",
  ENCODE_FAILED: "Encoding failed. Try different settings or another file.",
  CANCELLED: "The operation was cancelled.",
  TIMEOUT: "Processing took too long and was stopped.",
  BUSY: "Another job is already running. Wait for it to finish or cancel it.",
  WORKER_INIT_FAILED: "The processing engine could not start in this browser.",
  ASSET_LOAD_FAILED: "Required processing files could not be downloaded. Check your connection and retry.",
  STORAGE_UNAVAILABLE: "Browser storage is unavailable. Private browsing or strict settings may block it.",
  QUOTA_EXCEEDED: "Browser storage is full. Free up space or export a backup and remove old items.",
  NETWORK_ERROR: "The request failed. Check your connection and try again.",
  UNEXPECTED_RESPONSE: "The server returned an unexpected response.",
  PAYLOAD_TOO_LARGE: "The upload is larger than the server can accept.",
  NOT_FOUND: "The requested item no longer exists.",
  CONFLICT: "The change conflicts with existing data.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
};

export const httpStatusByCode: Record<ErrorCode, number> = {
  INVALID_FILE: 400,
  UNSUPPORTED_FORMAT: 415,
  FILE_TOO_LARGE: 413,
  DURATION_TOO_LONG: 422,
  DIMENSIONS_TOO_LARGE: 422,
  DECODE_FAILED: 422,
  INVALID_SETTINGS: 400,
  TARGET_UNREACHABLE: 422,
  OUTPUT_TOO_LARGE: 413,
  ENCODE_FAILED: 500,
  CANCELLED: 499,
  TIMEOUT: 504,
  BUSY: 429,
  WORKER_INIT_FAILED: 500,
  ASSET_LOAD_FAILED: 500,
  STORAGE_UNAVAILABLE: 500,
  QUOTA_EXCEEDED: 507,
  NETWORK_ERROR: 502,
  UNEXPECTED_RESPONSE: 502,
  PAYLOAD_TOO_LARGE: 413,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (isAppError(error) && error.code === "CANCELLED")
  );
}

export interface UserError {
  code: ErrorCode;
  message: string;
  field?: string;
}

/** Converts any thrown value into a safe { code, message } pair for display. */
export function toUserError(error: unknown): UserError {
  if (isAppError(error)) {
    return { code: error.code, message: error.message, field: error.field };
  }
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  if (name === "AbortError") return { code: "CANCELLED", message: fallbackMessages.CANCELLED };
  if (name === "QuotaExceededError") return { code: "QUOTA_EXCEEDED", message: fallbackMessages.QUOTA_EXCEEDED };
  if (name === "EncodingError") return { code: "DECODE_FAILED", message: fallbackMessages.DECODE_FAILED };
  if (name === "MissingAPIError" || name === "DatabaseClosedError" || name === "OpenFailedError") {
    return { code: "STORAGE_UNAVAILABLE", message: fallbackMessages.STORAGE_UNAVAILABLE };
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return { code: "NETWORK_ERROR", message: fallbackMessages.NETWORK_ERROR };
  }
  return { code: "INTERNAL_ERROR", message: fallbackMessages.INTERNAL_ERROR };
}

export function defaultMessage(code: ErrorCode): string {
  return fallbackMessages[code];
}

/** JSON body shape returned by every API error response. */
export interface ApiErrorBody {
  error: UserError;
}
