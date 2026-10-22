"use client";

import { useId, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Before/after comparison. The range input is the accessible control; the divider
 * is decorative. Images render on a CSS checkerboard so transparency is visible.
 */
export function ImageCompare({
  originalUrl,
  resultUrl,
  resultLabel,
  className,
}: {
  originalUrl: string | null;
  resultUrl: string;
  resultLabel: string;
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const [failed, setFailed] = useState<{ url: string | null; original: boolean; result: boolean }>({
    url: null,
    original: false,
    result: false,
  });
  const id = useId();
  // Reset failure flags when the result changes (derived, no effect needed).
  const state = failed.url === resultUrl ? failed : { url: resultUrl, original: false, result: false };
  const markFailed = (key: "original" | "result") => setFailed({ ...state, [key]: true });

  if (state.result) {
    return (
      <div className={cn("bg-checker flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl p-6 text-center", className)}>
        <ImageOff className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">This browser cannot display {resultLabel} images</p>
        <p className="text-xs text-muted-foreground">The file is valid — download it to view it in another app.</p>
      </div>
    );
  }

  const canCompare = originalUrl && !state.original;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="bg-checker relative overflow-hidden rounded-xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        <img
          src={resultUrl}
          alt={`Result preview (${resultLabel})`}
          className="mx-auto block max-h-120 w-full object-contain"
          onError={() => markFailed("result")}
        />
        {canCompare && (
          <>
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
              <img
                src={originalUrl}
                alt=""
                className="bg-checker mx-auto block h-full max-h-120 w-full object-contain"
                onError={() => markFailed("original")}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_0_1px_rgb(255_255_255/0.6)]"
              style={{ left: `${position}%` }}
              aria-hidden
            />
            <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-semibold">
              Original
            </span>
            <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-background/85 px-2 py-0.5 text-[11px] font-semibold">
              {resultLabel}
            </span>
          </>
        )}
      </div>
      {canCompare && (
        <div className="flex items-center gap-3">
          <label htmlFor={id} className="shrink-0 text-xs text-muted-foreground">
            Compare
          </label>
          <input
            id={id}
            type="range"
            min={0}
            max={100}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            aria-valuetext={`${position}% original`}
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
          />
        </div>
      )}
    </div>
  );
}
