import type { OutputFormat } from "./formats";

/** Unified result of a browser or server job, as shown in the UI. */
export interface ProcessResult {
  blob: Blob;
  format: OutputFormat;
  width: number;
  height: number;
  frames: number;
  quality: number | null;
  lossless: boolean;
  scale: number;
  engine: "browser" | "server";
  attempts: number;
  /** null when no target size was requested. */
  targetMet: boolean | null;
  largerThanOriginal: boolean;
  explanation: string | null;
  suggestion: string | null;
}
