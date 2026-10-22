import { sanitizeFilename } from "@/lib/download";
import { renderPngBlob, renderSvg, type QrRenderConfig } from "./render";

export type ExportFormat = "png" | "svg";

export interface ZipEntry {
  name: string;
  config: QrRenderConfig;
}

/**
 * Builds a ZIP of QR exports in the browser. fflate is imported on demand so it is
 * only downloaded when someone actually exports several codes.
 */
export async function buildQrZip(
  entries: ZipEntry[],
  formats: ExportFormat[],
  pngSize: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { zip } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const encoder = new TextEncoder();

  const uniqueBase = (name: string) => {
    const base = sanitizeFilename(name, "qr-code");
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})`;
    used.add(candidate.toLowerCase());
    return candidate;
  };

  for (const [index, entry] of entries.entries()) {
    const base = uniqueBase(entry.name);
    if (formats.includes("svg")) files[`${base}.svg`] = encoder.encode(renderSvg(entry.config));
    if (formats.includes("png")) {
      const { blob } = await renderPngBlob(entry.config, pngSize);
      files[`${base}.png`] = new Uint8Array(await blob.arrayBuffer());
    }
    onProgress?.(index + 1, entries.length);
  }

  const data = await new Promise<Uint8Array>((resolve, reject) =>
    // PNG/SVG are already compact; level 6 keeps SVGs small without slowing PNGs much.
    zip(files, { level: 6 }, (error, result) => (error ? reject(error) : resolve(result))),
  );
  return new Blob([data as BlobPart], { type: "application/zip" });
}
