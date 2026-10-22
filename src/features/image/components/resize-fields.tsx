"use client";

import { useId } from "react";
import { Field } from "@/components/tool/field";
import { SegmentedControl } from "@/components/tool/segmented-control";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { imageLimits } from "@/config/limits";
import { computeOutputDimensions } from "../lib/resize";
import type { ResizeOptions } from "../lib/schema";
import { NumberInput } from "./number-field";

export function ResizeFields({
  value,
  onChange,
  source,
  errors,
  disabled,
}: {
  value: ResizeOptions;
  onChange: (value: ResizeOptions) => void;
  source: { width: number | null; height: number | null } | null;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const id = useId();
  const set = (patch: Partial<ResizeOptions>) => onChange({ ...value, ...patch });
  const preview =
    source?.width && source.height && value.mode !== "none"
      ? computeOutputDimensions({ width: source.width, height: source.height }, value)
      : null;

  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Resize"
        size="sm"
        value={value.mode}
        disabled={disabled}
        onValueChange={(mode) => set({ mode })}
        options={[
          { value: "none", label: "Original size" },
          { value: "max", label: "Max edge" },
          { value: "exact", label: "Width / height" },
        ]}
      />
      {value.mode === "max" && (
        <Field label="Longest edge" error={errors["resize.maxDimension"]} hint="The other side scales to keep proportions.">
          <NumberInput
            value={value.maxDimension}
            onValueChange={(maxDimension) => set({ maxDimension })}
            min={imageLimits.minOutputDimension}
            max={imageLimits.maxOutputDimension}
            suffix="px"
            disabled={disabled}
            placeholder="e.g. 1920"
          />
        </Field>
      )}
      {value.mode === "exact" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width" error={errors["resize.width"]}>
            <NumberInput
              value={value.width}
              onValueChange={(width) => set({ width })}
              min={imageLimits.minOutputDimension}
              max={imageLimits.maxOutputDimension}
              suffix="px"
              disabled={disabled}
              placeholder={source?.width ? String(source.width) : "Auto"}
            />
          </Field>
          <Field label="Height" error={errors["resize.height"]}>
            <NumberInput
              value={value.height}
              onValueChange={(height) => set({ height })}
              min={imageLimits.minOutputDimension}
              max={imageLimits.maxOutputDimension}
              suffix="px"
              disabled={disabled}
              placeholder={source?.height ? String(source.height) : "Auto"}
            />
          </Field>
        </div>
      )}
      {value.mode !== "none" && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {value.mode === "exact" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${id}-aspect`}
                checked={value.keepAspect}
                disabled={disabled}
                onCheckedChange={(checked) => set({ keepAspect: checked === true })}
              />
              <Label htmlFor={`${id}-aspect`} className="text-sm font-normal">
                Preserve aspect ratio
              </Label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${id}-upscale`}
              checked={value.allowUpscale}
              disabled={disabled}
              onCheckedChange={(checked) => set({ allowUpscale: checked === true })}
            />
            <Label htmlFor={`${id}-upscale`} className="text-sm font-normal">
              Allow enlarging
            </Label>
          </div>
        </div>
      )}
      {preview && (
        <p className="text-xs text-muted-foreground tabular" aria-live="polite">
          Output: {preview.width} × {preview.height} px
        </p>
      )}
    </div>
  );
}
