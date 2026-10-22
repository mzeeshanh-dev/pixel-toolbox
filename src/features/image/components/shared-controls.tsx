"use client";

import { useId } from "react";
import { Cloud } from "lucide-react";
import { StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatInfo, type OutputFormat } from "../lib/formats";

/** Marks an option that requires server processing. */
export function ServerTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
      <Cloud className="size-3" aria-hidden /> Server
    </span>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  hint,
  display,
  aside,
}: {
  label: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  hint?: React.ReactNode;
  display?: string;
  aside?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label id={`${id}-label`} className="flex items-center gap-2 text-sm font-medium">
          {label} {aside}
        </Label>
        <span className="text-sm font-semibold tabular">{display ?? value}</span>
      </div>
      <Slider
        aria-labelledby={`${id}-label`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  aside,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  aside?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          {label} {aside}
        </Label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </div>
  );
}

/** Warns when transparency would be flattened and lets the user pick the fill colour. */
export function TransparencyWarning({
  format,
  background,
  onBackgroundChange,
  onSwitchFormat,
  disabled,
}: {
  format: OutputFormat;
  background: string;
  onBackgroundChange: (value: string) => void;
  onSwitchFormat: (format: OutputFormat) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <StatusMessage
      tone="warning"
      title={`${formatInfo[format].label} cannot keep transparency`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={id} className="text-xs font-medium text-foreground">
            Fill colour
          </Label>
          <Input
            id={id}
            type="color"
            value={background}
            disabled={disabled}
            onChange={(event) => onBackgroundChange(event.target.value)}
            className="h-8 w-12 cursor-pointer p-1"
          />
          <span className="font-mono text-xs">{background}</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSwitchFormat("webp")}>
            Use WebP
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onSwitchFormat("png")}>
            Use PNG
          </Button>
        </div>
      }
    >
      Transparent areas will be filled with the colour below. Choose PNG or WebP to keep them transparent.
    </StatusMessage>
  );
}

export function FirstFrameConsent({
  checked,
  onCheckedChange,
  disabled,
  message,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  message: string;
}) {
  const id = useId();
  return (
    <StatusMessage tone="warning" title="Animated image">
      <p>{message}</p>
      <div className="mt-2 flex items-center gap-2">
        <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} />
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          Convert first frame only
        </Label>
      </div>
    </StatusMessage>
  );
}
