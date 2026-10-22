import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatBytes, percentChange } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SummaryItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

/** Grid of measured facts about an input or result (sizes, dimensions, settings). */
export function FactGrid({ items, className }: { items: SummaryItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="truncate text-sm font-semibold tabular">{item.value}</dd>
          {item.hint && <dd className="text-xs text-muted-foreground">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Original vs result size comparison. Always truthful: when the output is larger the
 * badge says so instead of presenting it as a saving.
 */
export function SizeComparison({
  originalBytes,
  resultBytes,
  originalDetail,
  resultDetail,
  resultLabel = "Result",
}: {
  originalBytes: number;
  resultBytes: number;
  originalDetail?: React.ReactNode;
  resultDetail?: React.ReactNode;
  resultLabel?: string;
}) {
  const change = percentChange(originalBytes, resultBytes);
  const smaller = resultBytes < originalBytes;
  const saved = Math.abs(originalBytes - resultBytes);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border p-4">
        <p className="text-xs text-muted-foreground">Original</p>
        <p className="text-xl font-semibold tabular">{formatBytes(originalBytes)}</p>
        {originalDetail && <p className="mt-0.5 text-xs text-muted-foreground tabular">{originalDetail}</p>}
      </div>
      <div className="rounded-xl border border-border p-4">
        <p className="text-xs text-muted-foreground">{resultLabel}</p>
        <p className="text-xl font-semibold tabular">{formatBytes(resultBytes)}</p>
        <p
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-xs font-medium tabular",
            smaller ? "text-success" : "text-warning",
          )}
        >
          {smaller ? <ArrowDownRight className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
          {resultBytes === originalBytes
            ? "Same size as the original"
            : smaller
              ? `${change.toFixed(change < 10 ? 1 : 0)}% smaller · ${formatBytes(saved)} saved`
              : `${Math.abs(change).toFixed(0)}% larger than the original (+${formatBytes(saved)})`}
        </p>
        {resultDetail && <p className="mt-0.5 text-xs text-muted-foreground tabular">{resultDetail}</p>}
      </div>
    </div>
  );
}
