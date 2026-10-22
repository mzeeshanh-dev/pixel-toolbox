"use client";

import { Field, useField } from "@/components/tool/field";
import { SegmentedControl } from "@/components/tool/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/lib/format";
import type { SourceImage } from "../lib/analyze";
import { formatInfo, inputFormatLabels, type OutputFormat } from "../lib/formats";
import { presetQuality, type CompressOptions, type CompressionMode, type CompressionPreset } from "../lib/schema";
import { NumberInput } from "./number-field";
import { ResizeFields } from "./resize-fields";
import { FirstFrameConsent, SliderField, SwitchField, TransparencyWarning } from "./shared-controls";

export type FormatChoice = "original" | Exclude<OutputFormat, "gif" | "tiff">;

export interface TargetInput {
  enabled: boolean;
  value: number | undefined;
  unit: "KB" | "MB";
}

const modeDescriptions: Record<CompressionMode, string> = {
  quality:
    "Keeps quality at 70 or above. The target is a goal: if it needs more loss than that, you get the closest result and an explanation.",
  strict:
    "Searches lower quality (and smaller dimensions if allowed) to stay at or below the target. If it is impossible, you are told instead of getting an oversized file.",
  lossless: "Never discards image data. Uses lossless PNG, WebP or AVIF encoding; a target may not be reachable.",
};

/** Resolves "keep original format" to a concrete compression output. */
export function resolveFormatChoice(choice: FormatChoice, source: SourceImage | null): OutputFormat {
  if (choice !== "original") return choice;
  const format = source?.format;
  if (format === "jpeg" || format === "png" || format === "webp" || format === "avif" || format === "tiff") return format;
  return "png";
}

function originalAvailable(source: SourceImage | null) {
  return !source || !["gif", "bmp"].includes(source.format);
}

function FormatChoiceSelect({
  value,
  onChange,
  source,
  disabled,
}: {
  value: FormatChoice;
  onChange: (value: FormatChoice) => void;
  source: SourceImage | null;
  disabled?: boolean;
}) {
  const field = useField();
  const choices: FormatChoice[] = ["jpeg", "webp", "avif", "png"];
  return (
    <Select value={value} onValueChange={(next) => onChange(next as FormatChoice)} disabled={disabled}>
      <SelectTrigger {...field} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="original" disabled={!originalAvailable(source)}>
          Same as original{source ? ` (${inputFormatLabels[source.format]})` : ""}
        </SelectItem>
        {choices.map((format) => (
          <SelectItem key={format} value={format}>
            {formatInfo[format as OutputFormat].label}
            {format === "avif" && <span className="text-xs text-muted-foreground">· server</span>}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CompressSettings({
  options,
  onChange,
  formatChoice,
  onFormatChoiceChange,
  target,
  onTargetChange,
  source,
  errors,
  disabled,
  consentMessage,
}: {
  options: CompressOptions;
  onChange: (options: CompressOptions) => void;
  formatChoice: FormatChoice;
  onFormatChoiceChange: (choice: FormatChoice) => void;
  target: TargetInput;
  onTargetChange: (target: TargetInput) => void;
  source: SourceImage | null;
  errors: Record<string, string>;
  disabled?: boolean;
  consentMessage: string | null;
}) {
  const set = (patch: Partial<CompressOptions>) => onChange({ ...options, ...patch });
  const format = resolveFormatChoice(formatChoice, source);
  const lossless = options.mode === "lossless";

  return (
    <div className="space-y-5">
      <Field label="Preset">
        <SegmentedControl<CompressionPreset>
          label="Compression preset"
          size="sm"
          value={options.preset}
          disabled={disabled || lossless}
          onValueChange={(preset) => set({ preset, quality: presetQuality[preset] })}
          options={[
            { value: "auto", label: "Auto" },
            { value: "high", label: "High" },
            { value: "balanced", label: "Balanced" },
            { value: "small", label: "Small" },
          ]}
        />
      </Field>

      <Field label="Mode" hint={modeDescriptions[options.mode]}>
        <SegmentedControl<CompressionMode>
          label="Compression mode"
          size="sm"
          value={options.mode}
          disabled={disabled}
          onValueChange={(mode) => {
            set({ mode });
            if (mode === "lossless" && formatChoice === "jpeg") onFormatChoiceChange("webp");
          }}
          options={[
            { value: "quality", label: "Quality priority" },
            { value: "strict", label: "Strict size" },
            { value: "lossless", label: "Lossless" },
          ]}
        />
      </Field>

      <Field
        label="Output format"
        error={errors.format}
        hint={format === "png" && !lossless ? "PNG is compressed by reducing colours to a palette (lossy)." : undefined}
      >
        <FormatChoiceSelect value={formatChoice} onChange={onFormatChoiceChange} source={source} disabled={disabled} />
      </Field>

      {source?.alpha && format === "jpeg" && (
        <TransparencyWarning
          format="jpeg"
          background={options.background}
          onBackgroundChange={(background) => set({ background })}
          onSwitchFormat={(next) => onFormatChoiceChange(next as FormatChoice)}
          disabled={disabled}
        />
      )}
      {(consentMessage || (source?.animated && options.firstFrameOnly)) && (
        <FirstFrameConsent
          message={consentMessage ?? "Only the first frame will be kept."}
          checked={options.firstFrameOnly}
          onCheckedChange={(firstFrameOnly) => set({ firstFrameOnly })}
          disabled={disabled}
        />
      )}

      {!lossless && (
        <SliderField
          label="Maximum quality"
          value={options.quality}
          onChange={(quality) => set({ quality })}
          min={1}
          max={100}
          disabled={disabled}
          hint="The search never goes above this quality."
        />
      )}

      <div className="space-y-3 rounded-xl border border-border p-3.5">
        <SwitchField
          label="Target file size"
          description={
            source
              ? `Original is ${formatBytes(source.bytes)}.`
              : "Search for settings that fit within a size."
          }
          checked={target.enabled}
          onCheckedChange={(enabled) => onTargetChange({ ...target, enabled })}
          disabled={disabled}
        />
        {target.enabled && (
          <Field label="Target size" error={errors.targetBytes}>
            <div className="flex gap-2">
              <NumberInput
                className="flex-1"
                value={target.value}
                onValueChange={(value) => onTargetChange({ ...target, value })}
                min={0}
                step={target.unit === "MB" ? 0.1 : 10}
                disabled={disabled}
                placeholder={target.unit === "MB" ? "e.g. 1" : "e.g. 300"}
              />
              <Select
                value={target.unit}
                onValueChange={(unit) => onTargetChange({ ...target, unit: unit as TargetInput["unit"] })}
                disabled={disabled}
              >
                <SelectTrigger aria-label="Target size unit" className="h-10 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KB">KB</SelectItem>
                  <SelectItem value="MB">MB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        )}
        {target.enabled && options.mode === "strict" && (
          <SwitchField
            label="Allow resizing to reach target"
            description="Only used when the lowest quality is still too large."
            checked={options.allowResize}
            onCheckedChange={(allowResize) => set({ allowResize })}
            disabled={disabled}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Dimensions</p>
        <ResizeFields
          value={options.resize}
          onChange={(resize) => set({ resize })}
          source={source}
          errors={errors}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
