"use client";

import { useMemo } from "react";
import { QrCode } from "lucide-react";
import { tryRenderDataUrl, type QrRenderConfig } from "../lib/render";
import { cn } from "@/lib/utils";

/**
 * Renders a QR configuration as an <img> backed by a generated SVG data URL (never
 * injected markup). The checkerboard behind it is CSS only, so transparency is visible
 * without ever being baked into an export.
 */
export function QrImage({
  config,
  alt,
  className,
  imageClassName,
}: {
  config: QrRenderConfig;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  const rendered = useMemo(() => tryRenderDataUrl(config), [config]);
  return (
    <div className={cn("bg-checker grid aspect-square place-items-center overflow-hidden rounded-xl border border-border", className)}>
      {"url" in rendered ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL generated locally
        <img src={rendered.url} alt={alt} className={cn("size-full object-contain", imageClassName)} draggable={false} />
      ) : (
        <QrCode className="size-1/3 text-muted-foreground/50" aria-label="Preview unavailable" />
      )}
    </div>
  );
}
