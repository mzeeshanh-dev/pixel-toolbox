"use client";

import { useMemo, useState } from "react";
import { Check, Download, FileArchive, FilePlus2, Loader2, PencilLine, Save, Undo2 } from "lucide-react";
import { qrLimits } from "@/config/limits";
import { Field, useField } from "@/components/tool/field";
import { Panel, ToolWorkspace } from "@/components/tool/panel";
import { SegmentedControl } from "@/components/tool/segmented-control";
import { EmptyState, StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getDb, type ErrorCorrectionLevel, type QrStyle } from "@/lib/db";
import { downloadBlob, sanitizeFilename } from "@/lib/download";
import { toUserError } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ColorField } from "./components/color-field";
import { FolderSelect } from "./components/folder-select";
import { QrImage } from "./components/qr-image";
import { useDebouncedValue } from "./hooks";
import { colorPresets, getStyleWarnings, normalizeHex } from "./lib/colors";
import { buildQrZip } from "./lib/export";
import { getMatrix, pngDimensions, renderPngBlob, svgBlob, utf8Length, type QrRenderConfig } from "./lib/render";
import { createQrCode, createQrCodes, renameQrCode, saveQrVersion } from "./lib/repository";
import {
  defaultNameFor,
  normalizeStyle,
  parseBatch,
  validateContent,
  validateName,
  validateStyle,
  type ContentMode,
} from "./lib/validation";

export interface EditorDraft {
  mode: "single" | "batch";
  contentMode: ContentMode;
  content: string;
  name: string;
  batchText: string;
  style: QrStyle;
  folderId: string | null;
}

export interface EditingTarget {
  id: string;
  name: string;
  versionNumber: number;
}

export type Notice = { tone: "success" | "error" | "info"; message: string } | null;

const eccOptions: { value: ErrorCorrectionLevel; label: string; description: string }[] = [
  { value: "L", label: "L", description: "Low — recovers about 7% damage, holds the most data" },
  { value: "M", label: "M", description: "Medium — recovers about 15% damage" },
  { value: "Q", label: "Q", description: "Quartile — recovers about 25% damage" },
  { value: "H", label: "H", description: "High — recovers about 30% damage, best for print" },
];

const exportSizes = [256, 512, 1024, 2048, 4096] as const;

function ContentInput({
  draft,
  onChange,
}: {
  draft: EditorDraft;
  onChange: (content: string) => void;
}) {
  const field = useField();
  return draft.contentMode === "url" ? (
    <Input
      {...field}
      type="url"
      inputMode="url"
      autoComplete="url"
      spellCheck={false}
      placeholder="https://example.com"
      value={draft.content}
      onChange={(event) => onChange(event.target.value)}
      className="h-10"
    />
  ) : (
    <Textarea
      {...field}
      rows={4}
      placeholder="Any text, contact details, Wi-Fi info…"
      value={draft.content}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-28 resize-y"
    />
  );
}

function PlainInput(props: React.ComponentProps<typeof Input>) {
  const field = useField();
  return <Input {...field} {...props} />;
}

function PlainTextarea(props: React.ComponentProps<typeof Textarea>) {
  const field = useField();
  return <Textarea {...field} {...props} />;
}

export function QrEditor({
  draft,
  setDraft,
  editing,
  onStopEditing,
  onSaved,
  notice,
  setNotice,
}: {
  draft: EditorDraft;
  setDraft: (update: (draft: EditorDraft) => EditorDraft) => void;
  editing: EditingTarget | null;
  onStopEditing: () => void;
  onSaved: (target: EditingTarget | null) => void;
  notice: Notice;
  setNotice: (notice: Notice) => void;
}) {
  const [exportSize, setExportSize] = useState<number>(1024);
  const [busy, setBusy] = useState<null | "save" | "save-new" | "png" | "zip" | "batch-save">(null);
  const [touched, setTouched] = useState(false);

  const update = (patch: Partial<EditorDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateStyle = (patch: Partial<QrStyle>) =>
    setDraft((current) => ({ ...current, style: { ...current.style, ...patch } }));

  const styleErrors = validateStyle(draft.style);
  const styleValid = Object.keys(styleErrors).length === 0;
  const contentError = draft.mode === "single" ? validateContent(draft.content, draft.contentMode, draft.style.errorCorrectionLevel) : null;
  const nameError = validateName(draft.name);
  const warnings = styleValid ? getStyleWarnings(draft.style) : [];

  // Debounced so typing stays smooth; rendering itself is cached per configuration.
  const debounced = useDebouncedValue(draft, 150);
  const previewConfig = useMemo<QrRenderConfig | null>(() => {
    if (debounced.mode !== "single") return null;
    if (Object.keys(validateStyle(debounced.style)).length) return null;
    if (validateContent(debounced.content, debounced.contentMode, debounced.style.errorCorrectionLevel)) return null;
    return { content: normalizedContent(debounced), ...normalizeStyle(debounced.style) };
  }, [debounced]);

  const batch = useMemo(
    () => (debounced.mode === "batch" ? parseBatch(debounced.batchText, debounced.style.errorCorrectionLevel) : null),
    [debounced],
  );

  const canExport = draft.mode === "single" && !contentError && styleValid && previewConfig !== null;
  const dims = previewConfig ? pngDimensions(previewConfig, exportSize) : null;
  const bytes = utf8Length(draft.content);
  const fileBase = sanitizeFilename(draft.name.trim() || defaultNameFor(draft.content), "qr-code");

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({ tone: "error", message: toUserError(error).message });
    } finally {
      setBusy(null);
    }
  };

  const currentConfig = (): QrRenderConfig => ({ content: normalizedContent(draft), ...normalizeStyle(draft.style) });

  const downloadPng = () =>
    run("png", async () => {
      const { blob } = await renderPngBlob(currentConfig(), exportSize);
      downloadBlob(blob, `${fileBase}.png`);
    });

  const downloadSvg = () => {
    try {
      downloadBlob(svgBlob(currentConfig()), `${fileBase}.svg`);
    } catch (error) {
      setNotice({ tone: "error", message: toUserError(error).message });
    }
  };

  const save = (asNew: boolean) => {
    setTouched(true);
    if (contentError || nameError || !styleValid) {
      setNotice({ tone: "error", message: "Fix the highlighted fields before saving." });
      return;
    }
    const content = normalizedContent(draft);
    const style = normalizeStyle(draft.style);
    const name = draft.name.trim() || defaultNameFor(content);
    void run(asNew ? "save-new" : "save", async () => {
      const db = getDb();
      if (editing && !asNew) {
        const result = await saveQrVersion(db, editing.id, { content, style });
        const renamed = Boolean(draft.name.trim()) && draft.name.trim() !== editing.name;
        if (renamed) await renameQrCode(db, editing.id, draft.name);
        if (result.status === "unchanged") {
          setNotice({
            tone: "info",
            message: renamed
              ? "Name updated. Content and style are unchanged, so no new version was created."
              : "No content or style changes — no new version was created.",
          });
        } else {
          setNotice({ tone: "success", message: `Saved “${name}” as version ${result.version.versionNumber}.` });
        }
        onSaved({ id: editing.id, name, versionNumber: result.version.versionNumber });
        return;
      }
      const created = await createQrCode(db, { name, content, style, folderId: draft.folderId });
      setNotice({ tone: "success", message: `Saved “${created.code.name}” to your library.` });
      onSaved({ id: created.code.id, name: created.code.name, versionNumber: 1 });
    });
  };

  const saveBatch = () =>
    run("batch-save", async () => {
      if (!batch || batch.error || batch.items.length === 0) throw new Error("Nothing to save");
      const style = normalizeStyle(draft.style);
      const count = await createQrCodes(
        getDb(),
        batch.items.map((item) => ({ name: item.name, content: item.content, style, folderId: draft.folderId })),
      );
      setNotice({ tone: "success", message: `Saved ${count} QR code${count === 1 ? "" : "s"} to your library.` });
    });

  const downloadBatchZip = () =>
    run("zip", async () => {
      if (!batch || batch.items.length === 0) return;
      const style = normalizeStyle(draft.style);
      const blob = await buildQrZip(
        batch.items.map((item) => ({ name: item.name, config: { content: item.content, ...style } })),
        ["png", "svg"],
        exportSize,
      );
      downloadBlob(blob, "qr-codes.zip");
    });

  return (
    <ToolWorkspace>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Content">
          <div className="space-y-4">
            <SegmentedControl
              label="Generation mode"
              value={draft.mode}
              onValueChange={(mode) => update({ mode })}
              options={[
                { value: "single", label: "Single code" },
                { value: "batch", label: "Batch", disabled: Boolean(editing) },
              ]}
            />
            {draft.mode === "single" ? (
              <>
                <SegmentedControl
                  label="Content type"
                  size="sm"
                  value={draft.contentMode}
                  onValueChange={(contentMode) => update({ contentMode })}
                  options={[
                    { value: "url", label: "URL" },
                    { value: "text", label: "Plain text" },
                  ]}
                />
                <Field
                  label={draft.contentMode === "url" ? "Website URL" : "Text"}
                  labelAside={`${bytes.toLocaleString("en")} / ${qrLimits.maxContentBytes.toLocaleString("en")} bytes`}
                  error={touched || draft.content ? contentError : null}
                >
                  <ContentInput draft={draft} onChange={(content) => update({ content })} />
                </Field>
                <Field label="Name" hint="Optional. Used for the library and file names." error={nameError}>
                  <PlainInput
                    value={draft.name}
                    maxLength={qrLimits.maxNameLength + 10}
                    placeholder={draft.content ? defaultNameFor(draft.content) : "e.g. Restaurant menu"}
                    onChange={(event) => update({ name: event.target.value })}
                    className="h-10"
                  />
                </Field>
              </>
            ) : (
              <Field
                label="One code per line"
                labelAside={batch && !batch.error ? `${batch.items.length} valid` : undefined}
                hint={`Optional name before a pipe, e.g. “Menu | https://example.com/menu”. Up to ${qrLimits.maxBatchItems} lines.`}
                error={batch?.error && draft.batchText ? batch.error : null}
              >
                <PlainTextarea
                  rows={8}
                  value={draft.batchText}
                  spellCheck={false}
                  placeholder={"Menu | https://example.com/menu\nhttps://example.com/contact\nWi-Fi password: hunter2"}
                  onChange={(event) => update({ batchText: event.target.value })}
                  className="min-h-40 resize-y font-mono text-[13px]"
                />
              </Field>
            )}
          </div>
        </Panel>

        <Panel title="Style">
          <div className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Presets</legend>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((preset) => {
                  const active =
                    normalizeHex(draft.style.foregroundColor) === preset.foreground &&
                    normalizeHex(draft.style.backgroundColor) === preset.background;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${preset.name} preset`}
                      title={preset.name}
                      onClick={() => updateStyle({ foregroundColor: preset.foreground, backgroundColor: preset.background })}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg border border-border transition-shadow outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        active && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                      )}
                      style={{ backgroundColor: preset.background }}
                    >
                      <span className="size-4 rounded-[4px]" style={{ backgroundColor: preset.foreground }} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ColorField
                label="Foreground"
                value={draft.style.foregroundColor}
                onChange={(foregroundColor) => updateStyle({ foregroundColor })}
                error={styleErrors.foregroundColor}
              />
              <ColorField
                label="Background"
                value={draft.style.backgroundColor}
                onChange={(backgroundColor) => updateStyle({ backgroundColor })}
                error={draft.style.transparentBackground ? undefined : styleErrors.backgroundColor}
                disabled={draft.style.transparentBackground}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="qr-transparent">Transparent background</Label>
                <p className="text-xs text-muted-foreground">PNG and SVG exports keep real transparency.</p>
              </div>
              <Switch
                id="qr-transparent"
                checked={draft.style.transparentBackground}
                onCheckedChange={(transparentBackground) => updateStyle({ transparentBackground })}
              />
            </div>

            <Field
              label="Error correction"
              hint={eccOptions.find((option) => option.value === draft.style.errorCorrectionLevel)?.description}
            >
              <SegmentedControl
                label="Error correction level"
                value={draft.style.errorCorrectionLevel}
                onValueChange={(errorCorrectionLevel) => updateStyle({ errorCorrectionLevel })}
                options={eccOptions}
              />
            </Field>

            <Field
              label="Quiet zone (margin)"
              labelAside={`${draft.style.margin} module${draft.style.margin === 1 ? "" : "s"}`}
              error={styleErrors.margin}
            >
              <Slider
                min={qrLimits.minMargin}
                max={qrLimits.maxMargin}
                step={1}
                value={[draft.style.margin]}
                onValueChange={([margin]) => updateStyle({ margin })}
                aria-label="Quiet zone in modules"
                className="py-2"
              />
            </Field>

            {warnings.length > 0 && (
              <div className="space-y-2">
                {warnings.map((warning) => (
                  <StatusMessage key={warning.message} tone={warning.tone}>
                    {warning.message}
                  </StatusMessage>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-20">
        {draft.mode === "single" ? (
          <Panel
            title="Preview"
            description={
              previewConfig && dims
                ? `QR version ${getVersionLabel(previewConfig)} · ${dims.total}×${dims.total} modules`
                : "Updates as you type"
            }
          >
            <div className="space-y-5">
              {editing && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-accent px-3.5 py-2.5 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <PencilLine className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      Editing <strong className="font-semibold">{editing.name}</strong> · v{editing.versionNumber}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={onStopEditing}>
                    <Undo2 aria-hidden /> Discard
                  </Button>
                </div>
              )}
              <div className="mx-auto w-full max-w-[22rem]">
                {previewConfig ? (
                  <QrImage config={previewConfig} alt={`QR code preview for ${previewConfig.content}`} className="p-3" />
                ) : (
                  <div className="bg-checker grid aspect-square place-items-center rounded-xl border border-dashed border-input p-6">
                    <EmptyState title={draft.content.trim() ? "Fix the highlighted fields" : "Your QR code will appear here"} className="rounded-xl bg-card/90 py-6">
                      {draft.content.trim() ? "The preview updates once the content and colours are valid." : "Enter a URL or some text to begin."}
                    </EmptyState>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="PNG size" hint={dims ? `Exports at ${dims.pixels} × ${dims.pixels} px (whole pixels per module).` : undefined}>
                  <ExportSizeSelect value={exportSize} onChange={setExportSize} />
                </Field>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={downloadPng} disabled={!canExport || busy === "png"}>
                    {busy === "png" ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} PNG
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={downloadSvg} disabled={!canExport}>
                    <Download aria-hidden /> SVG
                  </Button>
                </div>
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                {editing ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button size="lg" onClick={() => save(false)} disabled={busy !== null}>
                      {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                      Save as new version
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => save(true)} disabled={busy !== null}>
                      {busy === "save-new" ? <Loader2 className="animate-spin" aria-hidden /> : <FilePlus2 aria-hidden />}
                      Save as new code
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field label="Save to folder">
                      <FolderSelect value={draft.folderId} onChange={(folderId) => update({ folderId })} />
                    </Field>
                    <Button size="lg" className="h-10" onClick={() => save(false)} disabled={busy !== null}>
                      {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                      Save to library
                    </Button>
                  </div>
                )}
                <NoticeArea notice={notice} />
              </div>
            </div>
          </Panel>
        ) : (
          <Panel
            title="Batch preview"
            description={batch && !batch.error ? `${batch.items.length} valid · ${batch.errors.length} with problems` : "One code per line"}
          >
            <div className="space-y-5">
              {batch && batch.errors.length > 0 && (
                <StatusMessage tone="warning" title="Some lines will be skipped">
                  <ul className="max-h-32 space-y-0.5 overflow-auto">
                    {batch.errors.map((error) => (
                      <li key={error.line}>
                        <strong>Line {error.line}:</strong> {error.message}
                      </li>
                    ))}
                  </ul>
                </StatusMessage>
              )}
              {batch && batch.items.length > 0 && styleValid ? (
                <ul className="grid max-h-[28rem] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
                  {batch.items.map((item) => (
                    <li key={item.line} className="min-w-0 space-y-1.5">
                      <QrImage config={{ content: item.content, ...normalizeStyle(draft.style) }} alt={`QR code for ${item.name}`} className="p-1.5" />
                      <p className="truncate text-xs font-medium" title={item.name}>
                        {item.name}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing to preview yet">Enter one URL or text per line on the left.</EmptyState>
              )}
              <Field label="PNG size in ZIP">
                <ExportSizeSelect value={exportSize} onChange={setExportSize} />
              </Field>
              <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
                <Field label="Save to folder" className="sm:col-span-2">
                  <FolderSelect value={draft.folderId} onChange={(folderId) => update({ folderId })} />
                </Field>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={downloadBatchZip}
                  disabled={!batch || batch.items.length === 0 || !styleValid || busy !== null}
                >
                  {busy === "zip" ? <Loader2 className="animate-spin" aria-hidden /> : <FileArchive aria-hidden />}
                  Download ZIP
                </Button>
                <Button size="lg" onClick={saveBatch} disabled={!batch || batch.items.length === 0 || !styleValid || busy !== null}>
                  {busy === "batch-save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
                  Save all ({batch?.items.length ?? 0})
                </Button>
              </div>
              <NoticeArea notice={notice} />
            </div>
          </Panel>
        )}
        <p className="px-1 text-xs text-muted-foreground">
          Saved codes live in this browser only. Export a backup from the Library tab to keep a copy.
          {previewConfig && ` SVG ≈ ${formatBytes(svgBlob(previewConfig).size)}.`}
        </p>
      </div>
    </ToolWorkspace>
  );
}

function getVersionLabel(config: QrRenderConfig): number {
  return getMatrix(config.content, config.errorCorrectionLevel).version;
}

function normalizedContent(draft: Pick<EditorDraft, "content" | "contentMode">): string {
  return draft.contentMode === "url" ? draft.content.trim() : draft.content;
}

function ExportSizeSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const field = useField();
  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger {...field} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {exportSizes.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size} × {size} px
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NoticeArea({ notice }: { notice: Notice }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {notice && (
        <StatusMessage tone={notice.tone}>
          <span className="inline-flex items-center gap-1.5">
            {notice.tone === "success" && <Check className="size-3.5" aria-hidden />}
            {notice.message}
          </span>
        </StatusMessage>
      )}
    </div>
  );
}
