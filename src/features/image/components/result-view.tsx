"use client";

import { Download, RotateCcw } from "lucide-react";
import { FactGrid, SizeComparison } from "@/components/tool/result-summary";
import { StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { useObjectUrl } from "@/hooks/use-object-url";
import { downloadBlob, replaceExtension } from "@/lib/download";
import { formatBytes, formatDimensions } from "@/lib/format";
import type { SourceImage } from "../lib/analyze";
import { formatInfo } from "../lib/formats";
import type { ProcessResult } from "../lib/types";
import { ImageCompare } from "./image-compare";

export function ResultView({
  source,
  sourceUrl,
  result,
  targetBytes,
  strict,
  onReset,
}: {
  source: SourceImage;
  sourceUrl: string | null;
  result: ProcessResult;
  targetBytes: number | null;
  strict: boolean;
  onReset: () => void;
}) {
  const resultUrl = useObjectUrl(result.blob);
  const info = formatInfo[result.format];
  const fileName = replaceExtension(source.file.name, info.extension);
  const missedStrict = strict && result.targetMet === false;
  const warn = result.targetMet === false || result.largerThanOriginal;

  const downloadLabel = missedStrict
    ? "Download closest result (over target)"
    : result.largerThanOriginal
      ? "Download anyway (larger than original)"
      : `Download ${info.label}`;

  return (
    <div className="space-y-5">
      {resultUrl && <ImageCompare originalUrl={sourceUrl} resultUrl={resultUrl} resultLabel={info.label} />}

      {result.targetMet === true && targetBytes !== null && (
        <StatusMessage tone="success" title="Target reached">
          {formatBytes(result.blob.size)} is within the {formatBytes(targetBytes)} target.
        </StatusMessage>
      )}
      {warn && (
        <StatusMessage
          tone="warning"
          title={
            missedStrict
              ? "Strict size target could not be met"
              : result.targetMet === false
                ? "Target not reached"
                : "Result is larger than the original"
          }
        >
          {result.explanation && <p>{result.explanation}</p>}
          {!result.explanation && result.largerThanOriginal && (
            <p>
              The {info.label} result is {formatBytes(result.blob.size)}, larger than the original{" "}
              {formatBytes(source.bytes)}. This is expected when converting to a lossless format or from a highly
              compressed source.
            </p>
          )}
          {result.suggestion && <p className="mt-1">Next step: {result.suggestion}</p>}
        </StatusMessage>
      )}

      <SizeComparison
        originalBytes={source.bytes}
        resultBytes={result.blob.size}
        originalDetail={formatDimensions(source.width ?? undefined, source.height ?? undefined)}
        resultDetail={formatDimensions(result.width, result.height)}
        resultLabel={`Result (${info.label})`}
      />

      <FactGrid
        items={[
          { label: "Format", value: info.label },
          { label: "Dimensions", value: formatDimensions(result.width, result.height) },
          {
            label: "Quality",
            value: result.lossless ? "Lossless" : result.quality !== null ? result.quality : "—",
          },
          { label: "Processed", value: result.engine === "browser" ? "In browser" : "On server" },
          { label: "Attempts", value: result.attempts },
          ...(result.scale < 1 ? [{ label: "Scaled to", value: `${Math.round(result.scale * 100)}%` }] : []),
          ...(result.frames > 1 ? [{ label: "Frames", value: result.frames }] : []),
        ]}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          variant={warn ? "outline" : "default"}
          className="flex-1"
          onClick={() => downloadBlob(result.blob, fileName)}
        >
          <Download aria-hidden /> {downloadLabel}
        </Button>
        <Button size="lg" variant="ghost" onClick={onReset}>
          <RotateCcw aria-hidden /> Start over
        </Button>
      </div>
    </div>
  );
}
