"use client";

import { useEffect, useRef, useState } from "react";
import { ClipboardPaste, Upload } from "lucide-react";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** First file in a clipboard or drag payload (copied files, screenshots, dragged items). */
export function firstFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  if (data.files && data.files.length > 0) return data.files[0];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Page-wide file intake for a tool: paste with Ctrl+V / ⌘V and drag-and-drop anywhere
 * on the page, including when a file is already loaded (it is replaced). Text paste
 * into inputs keeps working because only clipboard *files* are intercepted.
 */
export function FileIntake({
  onFile,
  enabled = true,
  label,
}: {
  onFile: (file: File) => void;
  enabled?: boolean;
  /** e.g. "Drop video to convert" */
  label: string;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handler = useRef(onFile);
  useEffect(() => {
    handler.current = onFile;
  }, [onFile]);

  useEffect(() => {
    if (!enabled) return;

    const onPaste = (event: ClipboardEvent) => {
      const file = firstFile(event.clipboardData);
      if (!file) return; // plain text paste: leave it alone
      if (isEditable(event.target) && !event.clipboardData?.files.length) return;
      event.preventDefault();
      handler.current(file);
    };
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDragOver = (event: DragEvent) => {
      // Required for the drop event to fire anywhere on the page.
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      // A FileDropzone on the page already handled (and prevented) this drop.
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      const file = firstFile(event.dataTransfer);
      if (file) handler.current(file);
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      depth.current = 0;
      setDragging(false);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  if (!dragging || !enabled) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/70 p-6 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-soft">
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Upload className="size-5" />
        </span>
        <p className="text-base font-semibold">{label}</p>
      </div>
    </div>
  );
}

/** Small hint shown under drop areas. */
export function PasteHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <ClipboardPaste className="size-3.5" aria-hidden />
      Tip: paste a copied file with{" "}
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">Ctrl</kbd>+
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">V</kbd>
      <span className="hidden sm:inline">or drop it anywhere on the page</span>
    </span>
  );
}
