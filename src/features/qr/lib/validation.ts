import { z } from "zod";
import { qrLimits } from "@/config/limits";
import { isAppError } from "@/lib/errors";
import type { ErrorCorrectionLevel, QrStyle } from "@/lib/db";
import { normalizeHex } from "./colors";
import { getMatrix, utf8Length } from "./render";

export type ContentMode = "url" | "text";

export const errorCorrectionLevels = ["L", "M", "Q", "H"] as const satisfies readonly ErrorCorrectionLevel[];

export const hexColorSchema = z
  .string()
  .trim()
  .refine((value) => normalizeHex(value) !== null, { message: "Use a HEX colour such as #1B1F3B or #FFF." })
  .transform((value) => normalizeHex(value) as string);

export const qrStyleSchema = z.object({
  foregroundColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  transparentBackground: z.boolean(),
  errorCorrectionLevel: z.enum(errorCorrectionLevels),
  margin: z.number().int().min(qrLimits.minMargin).max(qrLimits.maxMargin),
});

export const defaultStyle: QrStyle = {
  foregroundColor: "#1b1f3b",
  backgroundColor: "#ffffff",
  transparentBackground: false,
  errorCorrectionLevel: "M",
  margin: 4,
};

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Returns a user-facing error for the content, or null when it can be encoded. */
export function validateContent(content: string, mode: ContentMode, level: ErrorCorrectionLevel): string | null {
  if (!content.trim()) return mode === "url" ? "Enter a URL to encode." : "Enter some text to encode.";
  const bytes = utf8Length(content);
  if (bytes > qrLimits.maxContentBytes) {
    return `Content is ${bytes.toLocaleString("en")} bytes; the maximum is ${qrLimits.maxContentBytes.toLocaleString("en")} bytes.`;
  }
  if (mode === "url") {
    const trimmed = content.trim();
    if (/\s/.test(trimmed)) return "URLs cannot contain spaces.";
    if (!isHttpUrl(trimmed)) {
      return /^[\w-]+(\.[\w-]+)+/.test(trimmed)
        ? `Add the protocol, for example https://${trimmed}`
        : "Enter a full URL starting with https:// or http://";
    }
  }
  try {
    getMatrix(content, level);
  } catch (error) {
    return isAppError(error) ? error.message : "This content cannot be encoded.";
  }
  return null;
}

export function validateName(name: string): string | null {
  if (name.trim().length > qrLimits.maxNameLength) return `Names can be up to ${qrLimits.maxNameLength} characters.`;
  return null;
}

/** Validates a style; returns field → message for every invalid field. */
export function validateStyle(style: QrStyle): Partial<Record<keyof QrStyle, string>> {
  const result = qrStyleSchema.safeParse(style);
  if (result.success) return {};
  const errors: Partial<Record<keyof QrStyle, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof QrStyle;
    // A background colour is irrelevant while the background is transparent.
    if (field === "backgroundColor" && style.transparentBackground) continue;
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Normalises a validated style (lowercase 6-digit hex, integer margin). */
export function normalizeStyle(style: QrStyle): QrStyle {
  return {
    foregroundColor: normalizeHex(style.foregroundColor) ?? style.foregroundColor,
    backgroundColor: normalizeHex(style.backgroundColor) ?? defaultStyle.backgroundColor,
    transparentBackground: style.transparentBackground,
    errorCorrectionLevel: style.errorCorrectionLevel,
    margin: Math.round(style.margin),
  };
}

export interface BatchItem {
  line: number;
  name: string;
  content: string;
}

export interface BatchResult {
  items: BatchItem[];
  errors: { line: number; message: string }[];
  /** Set when the batch as a whole is invalid (e.g. too many lines). */
  error: string | null;
}

/**
 * Batch format: one code per line. Optionally prefix a name and a pipe:
 * `Menu | https://example.com/menu`. Blank lines are ignored.
 */
export function parseBatch(text: string, level: ErrorCorrectionLevel): BatchResult {
  const items: BatchItem[] = [];
  const errors: BatchResult["errors"] = [];
  const lines = text.split(/\r?\n/);
  const nonBlank = lines.filter((line) => line.trim()).length;
  if (nonBlank === 0) return { items, errors, error: "Enter at least one line." };
  if (nonBlank > qrLimits.maxBatchItems) {
    return { items, errors, error: `Batches can contain up to ${qrLimits.maxBatchItems} lines (you entered ${nonBlank}).` };
  }
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const pipe = raw.indexOf("|");
    const name = pipe >= 0 ? raw.slice(0, pipe).trim() : "";
    const content = (pipe >= 0 ? raw.slice(pipe + 1) : raw).trim();
    const nameError = validateName(name);
    const contentError = validateContent(content, "text", level);
    if (nameError || contentError) {
      errors.push({ line, message: (contentError ?? nameError) as string });
      return;
    }
    items.push({ line, name: name || defaultNameFor(content), content });
  });
  return { items, errors, error: null };
}

/** A readable default name derived from the content (host for URLs, first words otherwise). */
export function defaultNameFor(content: string): string {
  const trimmed = content.trim();
  if (isHttpUrl(trimmed)) {
    const url = new URL(trimmed);
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}`.slice(0, 60);
  }
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  return (firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine) || "QR code";
}

export function sameStyle(a: QrStyle, b: QrStyle): boolean {
  const na = normalizeStyle(a);
  const nb = normalizeStyle(b);
  return (
    na.foregroundColor === nb.foregroundColor &&
    na.backgroundColor === nb.backgroundColor &&
    na.transparentBackground === nb.transparentBackground &&
    na.errorCorrectionLevel === nb.errorCorrectionLevel &&
    na.margin === nb.margin
  );
}

export function pickStyle(source: QrStyle): QrStyle {
  return {
    foregroundColor: source.foregroundColor,
    backgroundColor: source.backgroundColor,
    transparentBackground: source.transparentBackground,
    errorCorrectionLevel: source.errorCorrectionLevel,
    margin: source.margin,
  };
}
