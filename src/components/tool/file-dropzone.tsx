"use client";

import { useId, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFile: (file: File) => void;
  accept?: string;
  title?: string;
  description?: React.ReactNode;
  /** Plain-language limits, e.g. "Up to 50 MB · 30 seconds". */
  limits?: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
  /** Accessible name for the hidden input (used by tests and screen readers). */
  inputLabel?: string;
}

/**
 * Click, keyboard or drag-and-drop file picker. Only the first file is used;
 * the `accept` attribute is a convenience hint and real validation happens later.
 */
export function FileDropzone({
  onFile,
  accept,
  title = "Drop a file here",
  description,
  limits,
  disabled,
  icon,
  compact,
  className,
  inputLabel = "Choose file",
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descriptionId = useId();

  const pick = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        pick(event.dataTransfer.files);
      }}
      className={cn(
        "relative rounded-2xl border-2 border-dashed border-input bg-card transition-colors",
        dragging && "border-primary bg-accent",
        disabled && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby={descriptionId}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-2xl text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed",
          compact ? "px-4 py-6" : "px-4 py-10 sm:py-14",
        )}
      >
        <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          {icon ?? <Upload className="size-5" aria-hidden />}
        </span>
        <span className="text-base font-semibold">{title}</span>
        <span id={descriptionId} className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
          {description ?? (
            <span>
              Drag and drop, or <span className="font-medium text-primary underline-offset-4">browse files</span>
            </span>
          )}
          {limits && <span className="text-xs">{limits}</span>}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={inputLabel}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(event) => {
          pick(event.target.files);
          // Allow re-selecting the same file after a reset.
          event.target.value = "";
        }}
      />
    </div>
  );
}
