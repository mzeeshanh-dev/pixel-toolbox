const unsafeFilenameChars = /[\\/:*?"<>|\u0000-\u001f]+/g;

export function sanitizeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .replace(unsafeFilenameChars, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return (cleaned || fallback).slice(0, 120);
}

export function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "") || "file";
  return `${sanitizeFilename(base)}.${extension.replace(/^\./, "")}`;
}

/** Triggers a browser download and releases the object URL afterwards. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = sanitizeFilename(filename);
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Give the browser time to start the download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
