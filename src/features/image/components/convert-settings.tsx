"use client";

import { Field, useField } from "@/components/tool/field";
import { SegmentedControl } from "@/components/tool/segmented-control";
import { StatusMessage } from "@/components/tool/status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SourceImage } from "../lib/analyze";
import { formatInfo, type OutputFormat } from "../lib/formats";
import { usesQuality, type EncodeOptions } from "../lib/schema";
import { ResizeFields } from "./resize-fields";
import { FirstFrameConsent, ServerTag, SliderField, SwitchField, TransparencyWarning } from "./shared-controls";

const losslessNotes: Partial<Record<OutputFormat, string>> = {
  png: "PNG is lossless: every pixel is kept, so there is no quality setting.",
  tiff: "LZW and Deflate are lossless, so there is no quality setting.",
  webp: "Lossless WebP keeps every pixel, so there is no quality setting.",
  avif: "Lossless AVIF keeps every pixel, so there is no quality setting.",
  gif: "GIF stores up to 256 colours per frame; there is no quality setting.",
};

function FormatSelect({
  value,
  onChange,
  formats,
  disabled,
}: {
  value: OutputFormat;
  onChange: (format: OutputFormat) => void;
  formats: OutputFormat[];
  disabled?: boolean;
}) {
  const field = useField();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as OutputFormat)} disabled={disabled}>
      <SelectTrigger {...field} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {formats.map((format) => (
          <SelectItem key={format} value={format}>
            {formatInfo[format].label}
            {(format === "avif" || format === "tiff" || format === "gif") && (
              <span className="text-xs text-muted-foreground">· server</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ConvertSettings({
  options,
  onChange,
  source,
  errors,
  disabled,
  consentMessage,
}: {
  options: EncodeOptions;
  onChange: (options: EncodeOptions) => void;
  source: SourceImage | null;
  errors: Record<string, string>;
  disabled?: boolean;
  consentMessage: string | null;
}) {
  const set = (patch: Partial<EncodeOptions>) => onChange({ ...options, ...patch });
  const formats: OutputFormat[] = ["jpeg", "png", "webp", "avif", "tiff"];
  if (source?.animated) formats.push("gif");
  const dropsAlpha =
    !formatInfo[options.format].alpha || (options.format === "tiff" && options.tiffCompression === "jpeg");
  const showQuality = usesQuality(options);
  const animatedKept = source?.animated && formatInfo[options.format].animation && !options.firstFrameOnly;

  return (
    <div className="space-y-5">
      <Field label="Output format" error={errors.format}>
        <FormatSelect value={options.format} onChange={(format) => set({ format })} formats={formats} disabled={disabled} />
      </Field>

      {source?.alpha && dropsAlpha && (
        <TransparencyWarning
          format={options.format}
          background={options.background}
          onBackgroundChange={(background) => set({ background })}
          onSwitchFormat={(format) => set({ format })}
          disabled={disabled}
        />
      )}

      {source?.animated && animatedKept && (
        <StatusMessage tone="info" title="Animation will be preserved">
          All {source.frames ?? ""} frames are converted on the server.{" "}
          {options.format === "gif" && "GIF is limited to 256 colours per frame."}
        </StatusMessage>
      )}
      {consentMessage && (
        <FirstFrameConsent
          message={consentMessage}
          checked={options.firstFrameOnly}
          onCheckedChange={(firstFrameOnly) => set({ firstFrameOnly })}
          disabled={disabled}
        />
      )}
      {source?.animated && options.firstFrameOnly && !consentMessage && (
        <FirstFrameConsent
          message="Only the first frame will be kept."
          checked={options.firstFrameOnly}
          onCheckedChange={(firstFrameOnly) => set({ firstFrameOnly })}
          disabled={disabled}
        />
      )}

      {options.format === "webp" && (
        <SwitchField
          label="Lossless"
          aside={<ServerTag />}
          description="Keeps every pixel. Files are usually larger."
          checked={options.webpLossless}
          onCheckedChange={(webpLossless) => set({ webpLossless })}
          disabled={disabled}
        />
      )}
      {options.format === "avif" && (
        <SwitchField
          label="Lossless"
          description="Keeps every pixel. Files are much larger."
          checked={options.avifLossless}
          onCheckedChange={(avifLossless) => set({ avifLossless })}
          disabled={disabled}
        />
      )}
      {options.format === "tiff" && (
        <Field label="TIFF compression" hint="LZW and Deflate are lossless; JPEG is lossy and drops transparency.">
          <SegmentedControl
            label="TIFF compression"
            size="sm"
            value={options.tiffCompression}
            onValueChange={(tiffCompression) => set({ tiffCompression })}
            disabled={disabled}
            options={[
              { value: "lzw", label: "LZW" },
              { value: "deflate", label: "Deflate" },
              { value: "jpeg", label: "JPEG" },
              { value: "none", label: "None" },
            ]}
          />
        </Field>
      )}
      {options.format === "png" && (
        <>
          <SwitchField
            label="Reduce colours (lossy)"
            aside={<ServerTag />}
            description="Quantises to a palette of up to 256 colours for much smaller files."
            checked={options.pngPalette}
            onCheckedChange={(pngPalette) => set({ pngPalette })}
            disabled={disabled}
          />
          {!options.pngPalette && (
            <SliderField
              label="Compression level"
              aside={options.pngCompressionLevel !== 6 ? <ServerTag /> : null}
              value={options.pngCompressionLevel}
              onChange={(pngCompressionLevel) => set({ pngCompressionLevel })}
              min={0}
              max={9}
              disabled={disabled}
              hint="Higher levels are slower and smaller. Image quality is identical at every level."
            />
          )}
        </>
      )}

      {showQuality ? (
        <SliderField
          label="Quality"
          value={options.quality}
          onChange={(quality) => set({ quality })}
          min={1}
          max={100}
          disabled={disabled}
          hint={
            options.format === "png"
              ? "Lower quality allows fewer colours in the palette."
              : "Lower quality gives smaller files with more visible artefacts."
          }
        />
      ) : (
        losslessNotes[options.format] && <p className="text-xs text-muted-foreground">{losslessNotes[options.format]}</p>
      )}

      {options.format === "jpeg" && (
        <>
          <Field label="Chroma subsampling" hint="4:4:4 keeps colour edges sharper (useful for text and graphics) but is larger.">
            <SegmentedControl
              label="Chroma subsampling"
              size="sm"
              value={options.chromaSubsampling}
              onValueChange={(chromaSubsampling) => set({ chromaSubsampling })}
              disabled={disabled}
              options={[
                { value: "4:2:0", label: "4:2:0 standard" },
                { value: "4:4:4", label: "4:4:4 sharp colour" },
              ]}
            />
          </Field>
          <SwitchField
            label="Progressive"
            aside={<ServerTag />}
            description="Loads in passes on slow connections."
            checked={options.progressive}
            onCheckedChange={(progressive) => set({ progressive })}
            disabled={disabled}
          />
        </>
      )}

      {(options.format === "avif" || options.format === "gif" || (options.format === "webp" && options.webpLossless)) && (
        <SliderField
          label="Encoding effort"
          value={options.effort}
          onChange={(effort) => set({ effort })}
          min={0}
          max={100}
          step={10}
          display={`${options.effort}%`}
          disabled={disabled}
          hint="Higher effort is slower but produces smaller files at the same quality."
        />
      )}

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Resize</p>
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
