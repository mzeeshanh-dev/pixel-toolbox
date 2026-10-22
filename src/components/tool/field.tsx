"use client";

import { createContext, useContext, useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldContextValue {
  id: string;
  hintId: string;
  errorId: string;
  invalid: boolean;
  describedBy: string | undefined;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Label + control + hint + error wrapper. Children receive accessible ids through
 * `useField()` so errors are announced and linked with aria-describedby.
 */
export function Field({
  label,
  hint,
  error,
  className,
  labelAside,
  children,
  id: providedId,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  labelAside?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  const generated = useId();
  const id = providedId ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, hintId, errorId, invalid: Boolean(error), describedBy }}>
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id} className="text-sm font-medium">
            {label}
          </Label>
          {labelAside && <div className="text-xs text-muted-foreground tabular">{labelAside}</div>}
        </div>
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** Spread onto the field's control: `<Input {...useField()} />`. */
export function useField() {
  const context = useContext(FieldContext);
  if (!context) return {};
  return {
    id: context.id,
    "aria-describedby": context.describedBy,
    "aria-invalid": context.invalid || undefined,
  };
}
