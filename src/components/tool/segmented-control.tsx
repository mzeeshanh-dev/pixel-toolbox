"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

/** Accessible single-choice pill group (radio semantics, arrow-key navigation). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  disabled,
  size = "md",
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={label}
      disabled={disabled}
      orientation="horizontal"
      className={cn("flex w-full gap-1 rounded-xl bg-muted p-1", className)}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          title={option.description}
          className={cn(
            "flex-1 rounded-lg px-2.5 font-medium text-muted-foreground transition-colors outline-none",
            "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-soft",
            "disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm" ? "min-h-8 py-1 text-xs" : "min-h-9 py-1.5 text-sm",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
