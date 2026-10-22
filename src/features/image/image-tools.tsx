"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, ImagePlus, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { FileIntake, PasteHint } from "@/components/tool/file-intake";
import { Panel, ToolWorkspace } from "@/components/tool/panel";
import { RecentJobs } from "@/components/tool/recent-jobs";
import { FactGrid } from "@/components/tool/result-summary";
import { EmptyState, ErrorMessage, ProcessingProgress, StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KB, MB, imageLimits } from "@/config/limits";
import { useObjectUrl } from "@/hooks/use-object-url";
import { toUserError, type UserError } from "@/lib/errors";
import { formatBytes, formatDimensions } from "@/lib/format";
import { recordJob } from "@/lib/jobs";
import { CompressSettings, resolveFormatChoice, type FormatChoice, type TargetInput } from "./components/compress-settings";
import { ConvertSettings } from "./components/convert-settings";
import { EngineBadge } from "./components/engine-badge";
import { ResultView } from "./components/result-view";
import { analyzeImage, detectBrowserEncoders, type SourceImage } from "./lib/analyze";
import { processOnServer } from "./lib/api-client";
import { browserCompress, browserConvert } from "./lib/browser-engine";
import { chooseEngine, type EngineDecision } from "./lib/engine";
import { formatInfo, inputFormatLabels, type OutputFormat } from "./lib/formats";
import {
  compressOptionsSchema,
  convertOptionsSchema,
  defaultCompressOptions,
  defaultEncodeOptions,
  fieldErrors,
  type CompressOptions,
  type EncodeOptions,
} from "./lib/schema";
import type { ProcessResult } from "./lib/types";

type Mode = "convert" | "compress";

type JobState =
  | { status: "idle"; notice?: string }
  | { status: "running"; label: string; detail?: string; progress: number | null }
  | { status: "error"; error: UserError };

interface StoredResult {
  result: ProcessResult;
  targetBytes: number | null;
  strict: boolean;
}

const accept = "image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.avif,.tif,.tiff,.bmp";

function targetToBytes(target: TargetInput): number | null {
  if (!target.enabled || target.value === undefined) return null;
  return Math.round(target.value * (target.unit === "MB" ? MB : KB));
}

export function ImageTools() {
  const [mode, setMode] = useState<Mode>("convert");
  const [source, setSource] = useState<SourceImage | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sourceError, setSourceError] = useState<UserError | null>(null);
  const [encoders, setEncoders] = useState<OutputFormat[] | null>(null);
  const [convertOptions, setConvertOptions] = useState<EncodeOptions>(() => defaultEncodeOptions("webp"));
  const [compressOptions, setCompressOptions] = useState<CompressOptions>(() => defaultCompressOptions("webp"));
  const [formatChoice, setFormatChoice] = useState<FormatChoice>("original");
  const [target, setTarget] = useState<TargetInput>({ enabled: false, value: undefined, unit: "KB" });
  const [job, setJob] = useState<JobState>({ status: "idle" });
  const [results, setResults] = useState<Partial<Record<Mode, StoredResult>>>({});
  const abortRef = useRef<AbortController | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const sourceUrl = useObjectUrl(source?.browserCanDecode ? source.file : null);

  useEffect(() => {
    let active = true;
    detectBrowserEncoders()
      .then((formats) => active && setEncoders(formats))
      .catch(() => active && setEncoders(["jpeg", "png"]));
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  const effectiveCompress = useMemo<CompressOptions>(
    () => ({ ...compressOptions, format: resolveFormatChoice(formatChoice, source), targetBytes: targetToBytes(target) }),
    [compressOptions, formatChoice, source, target],
  );

  const errors = useMemo(() => {
    const parsed =
      mode === "convert" ? convertOptionsSchema.safeParse(convertOptions) : compressOptionsSchema.safeParse(effectiveCompress);
    const out = parsed.success ? {} : fieldErrors(parsed.error);
    if (mode === "compress" && target.enabled && target.value === undefined) out.targetBytes = "Enter a target size.";
    return out;
  }, [mode, convertOptions, effectiveCompress, target]);

  const decision: EngineDecision | null = useMemo(() => {
    if (!source || !encoders) return null;
    const operation =
      mode === "convert"
        ? ({ type: "convert", options: convertOptions } as const)
        : ({ type: "compress", options: effectiveCompress } as const);
    return chooseEngine(source, operation, { browserEncodes: encoders });
  }, [source, encoders, mode, convertOptions, effectiveCompress]);

  const running = job.status === "running";
  const valid = Object.keys(errors).length === 0;
  const canRun = Boolean(source) && valid && decision?.kind === "ready" && !running && !analyzing;
  const consentMessage = decision?.kind === "needs-consent" ? decision.message : null;

  /** Stops a running job without reporting it as a user cancellation. */
  const discardJob = () => {
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
  };

  const handleFile = async (file: File) => {
    discardJob();
    setResults({});
    setJob({ status: "idle" });
    setSourceError(null);
    setSource(null);
    setAnalyzing(true);
    try {
      const analyzed = await analyzeImage(file);
      setSource(analyzed);
      // Sensible defaults: keep animation and transparency where possible.
      if (analyzed.animated) setConvertOptions((current) => ({ ...current, format: "webp", firstFrameOnly: false }));
      if (analyzed.format === "gif" || analyzed.format === "bmp") setFormatChoice("webp");
      else setFormatChoice("original");
    } catch (error) {
      setSourceError(toUserError(error));
    } finally {
      setAnalyzing(false);
    }
  };

  const reset = () => {
    discardJob();
    setSource(null);
    setSourceError(null);
    setResults({});
    setJob({ status: "idle" });
  };

  const run = async () => {
    if (!source || !decision || decision.kind !== "ready" || !valid || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    const onServer = decision.engine === "server";
    const options = mode === "convert" ? convertOptions : effectiveCompress;
    const targetBytes = mode === "compress" ? effectiveCompress.targetBytes : null;
    setJob({
      status: "running",
      label: onServer
        ? mode === "convert"
          ? "Uploading and converting on the server…"
          : "Uploading and optimising on the server…"
        : mode === "convert"
          ? "Converting in your browser…"
          : "Compressing in your browser…",
      detail: onServer ? "The server reports the result when finished; it is not stored." : undefined,
      progress: null,
    });

    const settings: Record<string, string | number | boolean> = {
      format: formatInfo[options.format].label,
      engine: onServer ? "server" : "browser",
    };
    if (mode === "compress") {
      settings.mode = effectiveCompress.mode;
      if (targetBytes !== null) settings.target = formatBytes(targetBytes);
    }

    try {
      let result: ProcessResult;
      if (mode === "convert") {
        result = onServer
          ? await processOnServer("convert", source.file, convertOptions, signal)
          : await browserConvert(source, convertOptions, signal);
      } else if (onServer) {
        result = await processOnServer("compress", source.file, effectiveCompress, signal);
      } else {
        result = await browserCompress(source, effectiveCompress, signal, (attempt) =>
          setJob({
            status: "running",
            label: `Compressing in your browser — attempt ${attempt.attempt}`,
            detail: `Quality ${attempt.quality}${attempt.scale < 1 ? ` at ${Math.round(attempt.scale * 100)}% size` : ""} → ${formatBytes(attempt.size)} (at most ${attempt.maxAttempts} attempts)`,
            progress: attempt.attempt / attempt.maxAttempts,
          }),
        );
      }
      if (signal.aborted) return;
      setResults((current) => ({
        ...current,
        [mode]: { result, targetBytes, strict: mode === "compress" && effectiveCompress.mode === "strict" },
      }));
      setJob({ status: "idle" });
      if (result.quality !== null) settings.quality = result.quality;
      void recordJob({
        tool: mode === "convert" ? "image-convert" : "image-compress",
        fileName: source.file.name,
        sourceBytes: source.bytes,
        outputBytes: result.blob.size,
        settings,
        status: result.targetMet === false ? "target-missed" : "success",
        message: result.explanation ?? undefined,
      });
    } catch (error) {
      const userError = toUserError(error);
      const cancelled = userError.code === "CANCELLED";
      // A discarded job (new file or reset) updates nothing.
      if (abortRef.current === controller) {
        setJob(
          cancelled
            ? { status: "idle", notice: "Processing was cancelled. Your settings are unchanged." }
            : { status: "error", error: userError },
        );
      }
      void recordJob({
        tool: mode === "convert" ? "image-convert" : "image-compress",
        fileName: source.file.name,
        sourceBytes: source.bytes,
        outputBytes: null,
        settings,
        status: cancelled ? "cancelled" : "failed",
        message: userError.message,
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const current = results[mode];
  const actionLabel = mode === "convert" ? `Convert to ${formatInfo[convertOptions.format].label}` : "Compress image";

  return (
    <div className="space-y-5">
      <FileIntake onFile={(file) => void handleFile(file)} enabled={!running && !analyzing} label="Drop the image to load it" />
      <Tabs
        value={mode}
        onValueChange={(value) => {
          if (!running) setMode(value as Mode);
        }}
        className="gap-0"
      >
        <ToolWorkspace>
          <Panel as="div" bodyClassName="space-y-5" aria-label="Image settings">
            <TabsList className="h-11 w-full rounded-xl bg-muted p-1">
              <TabsTrigger value="convert" disabled={running} className="rounded-lg data-[state=active]:bg-card">
                <RefreshCw aria-hidden /> Convert
              </TabsTrigger>
              <TabsTrigger value="compress" disabled={running} className="rounded-lg data-[state=active]:bg-card">
                <Wand2 aria-hidden /> Compress
              </TabsTrigger>
            </TabsList>

            {source ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-3">
                <div className="bg-checker grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border">
                  {sourceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img src={sourceUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={source.file.name}>
                    {source.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {inputFormatLabels[source.format]} · {formatBytes(source.bytes)} ·{" "}
                    {formatDimensions(source.width ?? undefined, source.height ?? undefined)}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={running} onClick={() => replaceInputRef.current?.click()}>
                  Replace
                </Button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept={accept}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Replace image"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void handleFile(file);
                  }}
                />
              </div>
            ) : (
              <FileDropzone
                onFile={(file) => void handleFile(file)}
                accept={accept}
                compact
                disabled={analyzing}
                inputLabel="Choose image"
                icon={<ImagePlus className="size-5" aria-hidden />}
                title={analyzing ? "Checking image…" : "Select or drop an image"}
                limits={
                  <>
                    <span>{`JPEG, PNG, WebP, GIF, AVIF, TIFF, BMP · up to ${formatBytes(imageLimits.maxBrowserInputBytes, 0)} in the browser, ${formatBytes(imageLimits.maxServerInputBytes, 0)} for server formats`}</span>
                    <PasteHint />
                  </>
                }
              />
            )}

            {sourceError && (
              <ErrorMessage title="This image can’t be used">{sourceError.message}</ErrorMessage>
            )}

            <TabsContent value="convert">
              <ConvertSettings
                options={convertOptions}
                onChange={setConvertOptions}
                source={source}
                errors={mode === "convert" ? errors : {}}
                disabled={running}
                consentMessage={mode === "convert" ? consentMessage : null}
              />
            </TabsContent>
            <TabsContent value="compress">
              <CompressSettings
                options={compressOptions}
                onChange={setCompressOptions}
                formatChoice={formatChoice}
                onFormatChoiceChange={setFormatChoice}
                target={target}
                onTargetChange={setTarget}
                source={source}
                errors={mode === "compress" ? errors : {}}
                disabled={running}
                consentMessage={mode === "compress" ? consentMessage : null}
              />
              {source && effectiveCompress.targetBytes !== null && effectiveCompress.targetBytes >= source.bytes && (
                <StatusMessage tone="info" className="mt-4">
                  The target is not smaller than the original ({formatBytes(source.bytes)}); the result will simply
                  aim for the best quality under it.
                </StatusMessage>
              )}
            </TabsContent>

            {decision?.kind === "unavailable" && (
              <ErrorMessage title="Not available for this file">{decision.message}</ErrorMessage>
            )}
            <EngineBadge decision={decision} />

            {running ? (
              <ProcessingProgress
                label={job.label}
                detail={job.detail}
                value={job.progress}
                onCancel={() => abortRef.current?.abort()}
              />
            ) : (
              <Button size="lg" className="w-full" disabled={!canRun} onClick={() => void run()}>
                <Sparkles aria-hidden /> {actionLabel}
              </Button>
            )}
            {!source && !analyzing && (
              <p className="-mt-2 text-center text-xs text-muted-foreground">Select an image to enable processing.</p>
            )}
            {job.status === "idle" && job.notice && <StatusMessage tone="info">{job.notice}</StatusMessage>}
            {job.status === "error" && (
              <ErrorMessage
                title="Processing failed"
                action={
                  <Button variant="outline" size="sm" onClick={() => void run()} disabled={!canRun}>
                    <RefreshCw aria-hidden /> Retry
                  </Button>
                }
              >
                {job.error.message}
              </ErrorMessage>
            )}
          </Panel>

          <Panel title={current ? "Result" : "Preview"} className="lg:sticky lg:top-20">
            {!source ? (
              <EmptyState icon={<ImageIcon aria-hidden />} title="No image selected">
                Choose an image to convert or compress. HEIC, SVG and other formats not listed are not supported.
              </EmptyState>
            ) : current ? (
              <ResultView
                source={source}
                sourceUrl={sourceUrl}
                result={current.result}
                targetBytes={current.targetBytes}
                strict={current.strict}
                onReset={reset}
              />
            ) : (
              <div className="space-y-5">
                <div className="bg-checker grid min-h-56 place-items-center overflow-hidden rounded-xl border border-border">
                  {sourceUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img
                      src={sourceUrl}
                      alt={`Original image: ${source.file.name}`}
                      className="max-h-105 w-full object-contain"
                    />
                  ) : (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      This browser cannot preview {inputFormatLabels[source.format]} files. It will be processed on the
                      server.
                    </p>
                  )}
                </div>
                <FactGrid
                  items={[
                    { label: "Detected format", value: inputFormatLabels[source.format] },
                    { label: "File size", value: formatBytes(source.bytes) },
                    { label: "Dimensions", value: formatDimensions(source.width ?? undefined, source.height ?? undefined) },
                    {
                      label: "Transparency",
                      value: source.alpha === null ? "Unknown" : source.alpha ? "Yes" : "No",
                    },
                    {
                      label: "Animation",
                      value: source.animated ? `${source.frames ?? "Multiple"} frames` : "Still image",
                    },
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  Adjust the settings, then press <strong className="text-foreground">{actionLabel}</strong>. The result
                  and its real size appear here.
                </p>
              </div>
            )}
          </Panel>
        </ToolWorkspace>
      </Tabs>
      <RecentJobs tools={["image-convert", "image-compress"]} />
    </div>
  );
}
