"use client";

import { useField } from "@/components/tool/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Numeric input that reports `undefined` for an empty field instead of 0, so
 * validation can explain what is missing rather than silently using a value.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const field = useField();
  return (
    <div className={cn("relative", className)}>
      <Input
        {...field}
        type="number"
        inputMode="numeric"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") return onValueChange(undefined);
          const parsed = Number(raw);
          onValueChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        className={cn("h-10 tabular", suffix && "pr-10")}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
