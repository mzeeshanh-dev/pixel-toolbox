"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock, Download, Film, Gauge, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { MB, videoLimits } from "@/config/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { FileIntake, PasteHint } from "@/components/tool/file-intake";
import { Field, useField } from "@/components/tool/field";
import { Panel, ToolWorkspace } from "@/components/tool/panel";
import { RecentJobs } from "@/components/tool/recent-jobs";
import { FactGrid, SizeComparison } from "@/components/tool/result-summary";
import { SegmentedControl } from "@/components/tool/segmented-control";
import { EmptyState, ErrorMessage, ProcessingProgress, StatusMessage } from "@/components/tool/status";
import { useObjectUrl } from "@/hooks/use-object-url";
import { downloadBlob, replaceExtension } from "@/lib/download";
import { toUserError, type UserError } from "@/lib/errors";
import { formatBytes, formatDimensions, formatDuration } from "@/lib/format";
import { recordJob } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { convertToGif, ffmpegProbe, type ConversionProgress, type ConversionResult } from "@/features/video/lib/convert";
import { FFmpegEngine } from "@/features/video/lib/ffmpeg-engine";
import { stopReasonText } from "@/features/video/lib/optimizer";
import { browserProbe, readHeader, validateFileBasics, validateMetadata, type VideoMetadata } from "@/features/video/lib/probe";
import {
  applyPreset,
  clipDuration,
  defaultEnd,
  defaultSettings,
  estimateComplexity,
  fpsOptions,
  maxWidthFor,
  presets,
  qualityProfiles,
  validateSettings,
  widthPresets,
  type FieldErrors,
  type GifSettings,
  type PresetId,
  type QualityPreference,
  type SizeMode,
} from "@/features/video/lib/settings";

type Phase = "idle" | "probing" | "ready" | "converting" | "done";

interface ProgressState {
  label: string;
  detail?: string;
  value: number | null;
}

const acceptedTypes = "video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.ogv,.3gp,.ts";

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const field = useField();
  return (
    <div className="relative">
      <Input
        {...field}
        type="number"
        inputMode="decimal"
        value={value === null || Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={cn("h-10 tabular", suffix && "pr-12")}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

function progressLabel(progress: ConversionProgress, hasTarget: boolean): ProgressState {
  const attempt = hasTarget ? `Attempt ${progress.attempt} of up to ${videoLimits.maxAttempts} · ` : "";
  const stage =
    progress.stage === "preparing" ? "Preparing video" : progress.stage === "palette" ? "Building colour palette" : "Encoding GIF";
  return {
    label: `${attempt}${stage}`,
    detail: progress.attempt > 1 ? progress.reason : undefined,
    value: progress.stage === "preparing" ? null : progress.value,
  };
}

export function VideoToGif() {
  const engineRef = useRef<FFmpegEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const runningRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<VideoMetadata | null>(null);
  const [settings, setSettings] = useState<GifSettings>(() => defaultSettings(videoLimits.maxOutputWidth));
  const [preset, setPreset] = useState<PresetId | "custom">("balanced");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [showAttempts, setShowAttempts] = useState(false);

  const videoUrl = useObjectUrl(meta?.previewable ? file : null);
  const gifUrl = useObjectUrl(result?.blob ?? null);

  const engine = useCallback(() => {
    engineRef.current ??= new FFmpegEngine();
    return engineRef.current;
  }, []);

  // Free the worker, its in-memory files and any running job when leaving the page.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      engineRef.current?.terminate();
    },
    [],
  );

  const source = useMemo(
    () => (meta ? { duration: meta.duration, width: meta.width, height: meta.height } : null),
    [meta],
  );

  const update = (patch: Partial<GifSettings>, keepPreset = false) => {
    setSettings((current) => ({ ...current, ...patch }));
    if (!keepPreset) setPreset("custom");
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as (keyof GifSettings)[]) delete next[key];
      return next;
    });
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setFile(null);
    setMeta(null);
    setResult(null);
    setError(null);
    setProgress(null);
    setFieldErrors({});
    setPreset("balanced");
    setSettings(defaultSettings(videoLimits.maxOutputWidth));
  };

  const handleFile = async (selected: File) => {
    if (runningRef.current) return;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setFile(selected);
    setMeta(null);
    setResult(null);
    setError(null);
    setFieldErrors({});
    setPhase("probing");
    setProgress({ label: "Checking video…", value: null });
    try {
      const container = validateFileBasics(selected, await readHeader(selected));
      // Start downloading the converter in the background while the browser probes.
      const loading = engine().load();
      loading.catch(() => undefined);

      let probed: { duration: number; width: number; height: number; codec?: string } | null = await browserProbe(selected);
      const previewable = probed !== null;
      if (!probed) {
        setProgress({ label: "Loading converter (≈31 MB, cached after first use)…", value: null });
        await loading;
        setProgress({ label: "Reading video with FFmpeg…", value: null });
        probed = await ffmpegProbe(engine(), selected, container, controller.signal);
      }
      validateMetadata(probed);
      const nextMeta: VideoMetadata = { ...probed, container, previewable };
      setMeta(nextMeta);
      const initial = { ...applyPreset("balanced", nextMeta.width, defaultSettings(nextMeta.width)), mode: settings.mode };
      setSettings({ ...initial, end: defaultEnd(initial, nextMeta) });
      setPreset("balanced");
      setPhase("ready");
    } catch (caught) {
      setError(toUserError(caught));
      setPhase("idle");
      setFile(null);
    } finally {
      setProgress(null);
      runningRef.current = false;
    }
  };

  const convert = async () => {
    if (!file || !meta || !source || runningRef.current) return;
    const validation = validateSettings(settings, source);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return;
    }
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setResult(null);
    setShowAttempts(false);
    setPhase("converting");
    const hasTarget = validation.value.targetMB !== null;
    const baseSettings = {
      fps: validation.value.fps,
      width: validation.value.width,
      quality: validation.value.quality,
      ...(hasTarget ? { target: `${validation.value.targetMB} MB`, mode: validation.value.mode } : {}),
    };
    try {
      if (!engine().isLoaded) {
        setProgress({ label: "Loading converter (≈31 MB, cached after first use)…", value: null });
        await engine().load();
      }
      const output = await convertToGif({
        engine: engine(),
        file,
        meta,
        settings: validation.value,
        signal: controller.signal,
        onProgress: (next) => setProgress(progressLabel(next, hasTarget)),
      });
      setResult(output);
      setPhase("done");
      void recordJob({
        tool: "video-to-gif",
        fileName: file.name,
        sourceBytes: file.size,
        outputBytes: output.bytes,
        settings: { ...baseSettings, fps: output.params.fps, width: output.width },
        status: output.meetsTarget ? "success" : "target-missed",
      });
    } catch (caught) {
      const userError = toUserError(caught);
      setError(userError);
      setPhase("ready");
      void recordJob({
        tool: "video-to-gif",
        fileName: file.name,
        sourceBytes: file.size,
        outputBytes: null,
        settings: baseSettings,
        status: userError.code === "CANCELLED" ? "cancelled" : "failed",
        message: userError.message,
      });
    } finally {
      setProgress(null);
      runningRef.current = false;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const busy = phase === "probing" || phase === "converting";
  const duration = meta ? clipDuration(settings, meta.duration) : 0;
  const estimate = source ? estimateComplexity(settings, source) : null;
  const maxWidth = meta ? maxWidthFor(meta.width) : videoLimits.maxOutputWidth;
  const strictFailed = result !== null && result.targetBytes !== null && !result.meetsTarget && result.mode === "strict";

  const setFromPlayhead = (key: "start" | "end") => {
    const time = videoRef.current?.currentTime;
    if (time !== undefined && Number.isFinite(time)) update({ [key]: Math.round(time * 10) / 10 }, true);
  };

  return (
    <div className="space-y-5">
      <FileIntake onFile={(selected) => void handleFile(selected)} enabled={!busy} label="Drop the video to load it" />
      <ToolWorkspace>
        {/* Settings column */}
        <div className="space-y-5">
          {!file || !meta ? (
            <FileDropzone
              onFile={handleFile}
              accept={acceptedTypes}
              disabled={busy}
              title="Drop your video here"
              icon={<Film className="size-5" aria-hidden />}
              inputLabel="Choose video file"
              limits={
                <>
                  <span>{`Up to ${formatBytes(videoLimits.maxInputBytes, 0)} · ${formatDuration(videoLimits.maxDurationSeconds)} · MP4, WebM, MOV and more`}</span>
                  <PasteHint />
                </>
              }
            />
          ) : (
            <Panel
              title="Source video"
              actions={
                <Button variant="ghost" size="sm" onClick={reset} disabled={phase === "converting"}>
                  <RotateCcw aria-hidden /> Start over
                </Button>
              }
            >
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <FactGrid
                className="mt-3"
                items={[
                  { label: "Size", value: formatBytes(file.size) },
                  { label: "Dimensions", value: formatDimensions(meta.width, meta.height) },
                  { label: "Duration", value: formatDuration(meta.duration) },
                ]}
              />
            </Panel>
          )}

          {phase === "probing" && progress && (
            <ProcessingProgress label={progress.label} value={progress.value} onCancel={cancel} />
          )}
          {error && phase !== "ready" && phase !== "done" && (
            <ErrorMessage title="This video can't be used">{error.message}</ErrorMessage>
          )}

          {meta && source && (
            <Panel title="GIF settings" bodyClassName="space-y-6">
              <fieldset disabled={busy} className="space-y-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium" id="preset-label">
                    Preset
                  </p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="preset-label">
                    {(Object.keys(presets) as PresetId[]).map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={preset === id}
                        onClick={() => {
                          setSettings((current) => applyPreset(id, meta.width, current));
                          setPreset(id);
                          setFieldErrors({});
                        }}
                        className={cn(
                          "rounded-xl border border-border px-2 py-2.5 text-left text-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          preset === id && "border-primary bg-accent ring-1 ring-primary",
                        )}
                      >
                        <span className="block text-sm font-semibold">{presets[id].label}</span>
                        <span className="block text-muted-foreground tabular">
                          {presets[id].fps} fps · {Math.min(presets[id].width, maxWidth)} px
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" error={fieldErrors.start}>
                    <NumberInput value={settings.start} onChange={(start) => update({ start: start ?? 0 }, true)} min={0} max={meta.duration} step={0.1} suffix="s" />
                  </Field>
                  <Field label="End" error={fieldErrors.end}>
                    <NumberInput
                      value={settings.end}
                      onChange={(end) => update({ end }, true)}
                      min={0}
                      max={meta.duration}
                      step={0.1}
                      suffix="s"
                      placeholder={meta.duration.toFixed(1)}
                    />
                  </Field>
                  {meta.previewable && (
                    <div className="col-span-2 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setFromPlayhead("start")}>
                        <Clock aria-hidden /> Start at playhead
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setFromPlayhead("end")}>
                        <Clock aria-hidden /> End at playhead
                      </Button>
                    </div>
                  )}
                  <p className="col-span-2 text-xs text-muted-foreground tabular">Clip length: {formatDuration(duration)}</p>
                </div>

                <Field label="Frame rate" error={fieldErrors.fps} labelAside={`${settings.fps} fps`}>
                  <SegmentedControl
                    label="Frame rate"
                    size="sm"
                    value={String(settings.fps)}
                    onValueChange={(value) => update({ fps: Number(value) })}
                    options={fpsOptions.map((fps) => ({ value: String(fps), label: fps }))}
                  />
                </Field>

                <div className="space-y-3">
                  <Field label="Width" error={fieldErrors.width} hint={`Up to ${maxWidth} px — GIFs are never upscaled beyond the source.`}>
                    <NumberInput value={settings.width} onChange={(width) => update({ width: width ?? Number.NaN })} min={videoLimits.minOutputWidth} max={maxWidth} step={2} suffix="px" />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {widthPresets
                      .filter((width) => width <= maxWidth)
                      .map((width) => (
                        <button
                          key={width}
                          type="button"
                          onClick={() => update({ width })}
                          className={cn(
                            "rounded-lg border border-border px-2.5 py-1 text-xs font-medium tabular hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                            settings.width === width && "border-primary bg-accent text-foreground",
                          )}
                        >
                          {width}
                        </button>
                      ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="keep-aspect" className="text-sm font-normal">
                      Preserve aspect ratio
                    </Label>
                    <Switch
                      id="keep-aspect"
                      checked={settings.keepAspect}
                      onCheckedChange={(keepAspect) =>
                        update({
                          keepAspect,
                          height: keepAspect ? null : Math.min(maxWidth, Math.round((settings.width * meta.height) / meta.width / 2) * 2),
                        })
                      }
                    />
                  </div>
                  {!settings.keepAspect && (
                    <Field label="Height" error={fieldErrors.height} hint="The video is stretched to fit these dimensions.">
                      <NumberInput value={settings.height} onChange={(height) => update({ height })} min={videoLimits.minOutputWidth} step={2} suffix="px" />
                    </Field>
                  )}
                </div>

                <Field label="Quality" hint={qualityProfiles[settings.quality].description}>
                  <SegmentedControl
                    label="Quality"
                    value={settings.quality}
                    onValueChange={(quality: QualityPreference) => update({ quality })}
                    options={(Object.keys(qualityProfiles) as QualityPreference[]).map((key) => ({
                      value: key,
                      label: qualityProfiles[key].label,
                    }))}
                  />
                </Field>

                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="target-toggle" className="flex items-center gap-2 text-sm font-medium">
                      <Gauge className="size-4 text-muted-foreground" aria-hidden /> Target file size
                    </Label>
                    <Switch
                      id="target-toggle"
                      checked={settings.targetMB !== null}
                      onCheckedChange={(on) => update({ targetMB: on ? 5 : null })}
                    />
                  </div>
                  {settings.targetMB !== null ? (
                    <>
                      <Field label="Maximum size" error={fieldErrors.targetMB}>
                        <NumberInput
                          value={settings.targetMB}
                          onChange={(targetMB) => update({ targetMB: targetMB ?? Number.NaN })}
                          min={videoLimits.minTargetBytes / MB}
                          max={videoLimits.maxTargetBytes / MB}
                          step={0.1}
                          suffix="MB"
                        />
                      </Field>
                      <SegmentedControl<SizeMode>
                        label="Size mode"
                        value={settings.mode}
                        onValueChange={(mode) => update({ mode }, true)}
                        options={[
                          { value: "quality", label: "Quality Priority" },
                          { value: "strict", label: "Strict Size Limit" },
                        ]}
                      />
                      <p className="text-xs text-muted-foreground">
                        {settings.mode === "quality"
                          ? "Measures each result and lowers frame rate, then width, only as far as needed. Colours are kept; the target is a goal, not a guarantee."
                          : "Keeps reducing frame rate, width and finally colours until the GIF fits. If it still cannot fit, you are told instead of getting an oversized file."}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Off: one encode with exactly the settings above. Turn on to let the converter measure and retry.
                    </p>
                  )}
                </div>
              </fieldset>

              {estimate && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground tabular">
                  <Sparkles className="size-3.5" aria-hidden />
                  About {estimate.frames.toLocaleString("en")} frames · {estimate.complexity} processing cost
                  {estimate.complexity === "High" && " — this may take a while"}
                </p>
              )}

              {duration > videoLimits.longClipSeconds && (
                <StatusMessage tone="info" title={`Long clip: ${formatDuration(duration)}`}>
                  Long GIFs are converted fully on this device, so this can take several minutes and the GIF may be
                  large (often 50–300 MB for minutes of video). Keep this tab open. For a smaller, faster result lower
                  the frame rate to 10 fps or the width to 320–480 px.
                </StatusMessage>
              )}

              <div className="sticky bottom-0 z-10 -mx-4 -mb-4 border-t border-border bg-card/95 p-4 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 lg:static lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                <Button size="lg" className="w-full" onClick={convert} disabled={busy}>
                  <Wand2 aria-hidden />
                  {phase === "converting" ? "Converting…" : result ? "Convert again" : "Convert to GIF"}
                </Button>
              </div>
            </Panel>
          )}
        </div>

        {/* Preview / results column */}
        <div className="space-y-5">
          <Panel title={result ? "Your GIF" : "Preview"} aria-live="polite">
            {phase === "converting" && progress ? (
              <ProcessingProgress label={progress.label} detail={progress.detail} value={progress.value} onCancel={cancel} />
            ) : null}

            {error && (phase === "ready" || phase === "done") && (
              <ErrorMessage
                title={error.code === "CANCELLED" ? "Conversion cancelled" : "Conversion failed"}
                action={
                  error.code !== "CANCELLED" && (
                    <Button size="sm" variant="outline" onClick={convert}>
                      <RotateCcw aria-hidden /> Try again
                    </Button>
                  )
                }
              >
                {error.message} Your settings were kept.
              </ErrorMessage>
            )}

            {result && gifUrl ? (
              <ResultView
                result={result}
                gifUrl={gifUrl}
                sourceBytes={file?.size ?? 0}
                fileName={file?.name ?? "animation.gif"}
                strictFailed={strictFailed}
                showAttempts={showAttempts}
                onToggleAttempts={() => setShowAttempts((value) => !value)}
              />
            ) : phase !== "converting" && meta ? (
              <div className={cn("space-y-3", error && "mt-4")}>
                {videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    muted
                    playsInline
                    className="aspect-video w-full rounded-xl bg-black object-contain"
                    aria-label={`Preview of ${file?.name ?? "the selected video"}`}
                  />
                ) : (
                  <StatusMessage tone="info" title="Preview unavailable">
                    This browser can&apos;t play this file, but FFmpeg can still convert it.
                  </StatusMessage>
                )}
              </div>
            ) : phase !== "converting" ? (
              <EmptyState icon={<Film aria-hidden />} title="No video selected">
                Choose a clip to preview it, trim it and convert it to a looping GIF. Everything happens on this device.
              </EmptyState>
            ) : null}
          </Panel>

          <StatusMessage tone="info" title="About GIF quality">
            GIF stores at most 256 colours per frame, so gradients and fine detail can never match the original video
            exactly. Palette generation keeps colours as faithful as the format allows.
          </StatusMessage>
        </div>
      </ToolWorkspace>

      <RecentJobs tools={["video-to-gif"]} />
    </div>
  );
}

function ResultView({
  result,
  gifUrl,
  sourceBytes,
  fileName,
  strictFailed,
  showAttempts,
  onToggleAttempts,
}: {
  result: ConversionResult;
  gifUrl: string;
  sourceBytes: number;
  fileName: string;
  strictFailed: boolean;
  showAttempts: boolean;
  onToggleAttempts: () => void;
}) {
  const target = result.targetBytes;
  const missed = target !== null && !result.meetsTarget;
  return (
    <div className="space-y-5">
      {strictFailed && target !== null ? (
        <ErrorMessage title={`Couldn't get under ${formatBytes(target)}`}>
          The smallest GIF reached was <strong>{formatBytes(result.bytes)}</strong> after {result.attempts.length}{" "}
          attempt{result.attempts.length === 1 ? "" : "s"}. {stopReasonText[result.stopReason]} Try a shorter clip, a
          lower width or frame rate, or a larger target. You can still download the closest attempt below — it is over
          your limit.
        </ErrorMessage>
      ) : missed && target !== null ? (
        <StatusMessage tone="warning" title="Target not reached — quality kept">
          The best result is {formatBytes(result.bytes)}, above the {formatBytes(target)} goal.{" "}
          {stopReasonText[result.stopReason]} Going smaller would mean heavy loss of smoothness or detail; switch to
          Strict Size Limit or lower the settings if size matters more.
        </StatusMessage>
      ) : target !== null ? (
        <StatusMessage tone="success" title="Within your target">
          {formatBytes(result.bytes)} of {formatBytes(target)} allowed.
        </StatusMessage>
      ) : null}

      <div className="bg-checker grid place-items-center overflow-hidden rounded-xl border border-border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
        <img src={gifUrl} alt={`Animated GIF converted from ${fileName}`} className="max-h-105 w-auto max-w-full" />
      </div>

      <SizeComparison originalBytes={sourceBytes} resultBytes={result.bytes} resultLabel="GIF" />

      <FactGrid
        items={[
          { label: "Dimensions", value: formatDimensions(result.width, result.height) },
          { label: "Frame rate", value: `${result.params.fps} fps` },
          { label: "Frames", value: result.frames ?? "—" },
          { label: "Colours", value: `${result.params.maxColors} max` },
          { label: "Duration", value: formatDuration(result.clipSeconds) },
          { label: "Attempts", value: result.attempts.length },
        ]}
      />

      {result.attempts.length > 1 && (
        <div className="rounded-xl border border-border">
          <button
            type="button"
            onClick={onToggleAttempts}
            aria-expanded={showAttempts}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Optimisation log
            <ChevronDown className={cn("size-4 transition-transform", showAttempts && "rotate-180")} aria-hidden />
          </button>
          {showAttempts && (
            <ol className="space-y-2 border-t border-border px-4 py-3 text-xs">
              {result.attempts.map((attempt, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-2 tabular">
                  <span>
                    <span className="font-semibold">#{index + 1}</span> {attempt.params.fps} fps · {attempt.params.width} px ·{" "}
                    {attempt.params.maxColors} colours
                    {index === result.bestIndex && <span className="ml-1.5 font-semibold text-primary">selected</span>}
                  </span>
                  <span className={cn(target !== null && attempt.bytes > target ? "text-warning" : "text-success")}>
                    {formatBytes(attempt.bytes)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        variant={strictFailed ? "outline" : "default"}
        onClick={() => downloadBlob(result.blob, replaceExtension(fileName, "gif"))}
      >
        <Download aria-hidden />
        {strictFailed ? `Download closest attempt (${formatBytes(result.bytes)}, over limit)` : `Download GIF · ${formatBytes(result.bytes)}`}
      </Button>
    </div>
  );
}
