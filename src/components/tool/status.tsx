"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Tone = "error" | "warning" | "info" | "success";

const toneStyles: Record<Tone, string> = {
  error: "border-destructive/30 bg-destructive-soft text-foreground [&_[data-icon]]:text-destructive",
  warning: "border-warning/30 bg-warning-soft text-foreground [&_[data-icon]]:text-warning",
  info: "border-border bg-muted text-foreground [&_[data-icon]]:text-muted-foreground",
  success: "border-success/30 bg-success-soft text-foreground [&_[data-icon]]:text-success",
};

const toneIcons = { error: AlertCircle, warning: AlertTriangle, info: Info, success: CheckCircle2 };

/** Inline status message. Errors use role="alert" so screen readers announce them immediately. */
export function StatusMessage({
  tone = "error",
  title,
  children,
  action,
  className,
  id,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const Icon = toneIcons[tone];
  return (
    <div
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", toneStyles[tone], className)}
    >
      <Icon data-icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>}
        {action && <div className="pt-1.5">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorMessage(props: Omit<React.ComponentProps<typeof StatusMessage>, "tone">) {
  return <StatusMessage tone="error" {...props} />;
}

/**
 * Progress for a running job. `value` is 0–1 from real processing events, or null when
 * the engine cannot report progress (an indeterminate spinner is shown instead).
 */
export function ProcessingProgress({
  label,
  detail,
  value,
  onCancel,
  className,
}: {
  label: string;
  detail?: React.ReactNode;
  value: number | null;
  onCancel?: () => void;
  className?: string;
}) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-muted/50 p-4", className)}>
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" aria-live="polite">
            {label}
          </p>
          {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
        </div>
        {percent !== null && <span className="tabular text-sm font-semibold">{percent}%</span>}
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <X aria-hidden /> Cancel
          </Button>
        )}
      </div>
      <Progress
        value={percent ?? undefined}
        aria-label={label}
        className="h-1.5"
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-4 py-10 text-center", className)}>
      {icon && (
        <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground [&>svg]:size-5">
          {icon}
        </span>
      )}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
