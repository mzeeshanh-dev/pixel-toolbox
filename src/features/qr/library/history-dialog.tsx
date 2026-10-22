"use client";

import { useState } from "react";
import { Download, History, Loader2, RotateCcw } from "lucide-react";
import { StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QrCodeRecord, QrVersionRecord } from "@/lib/db";
import { getDb } from "@/lib/db";
import { downloadBlob, sanitizeFilename } from "@/lib/download";
import { toUserError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QrImage } from "../components/qr-image";
import { useLibraryQuery } from "../hooks";
import { renderPngBlob, svgBlob, type QrRenderConfig } from "../lib/render";
import { listVersions, restoreVersion } from "../lib/repository";
import { pickStyle } from "../lib/validation";

const toConfig = (version: QrVersionRecord): QrRenderConfig => ({ content: version.content, ...pickStyle(version) });

export function HistoryDialog({
  code,
  onOpenChange,
  onRestored,
}: {
  code: QrCodeRecord | null;
  onOpenChange: (open: boolean) => void;
  onRestored: (message: string) => void;
}) {
  return (
    <Dialog open={code !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" aria-hidden /> Version history
          </DialogTitle>
          <DialogDescription>{code ? `“${code.name}” — restoring adds a new version; nothing is deleted.` : ""}</DialogDescription>
        </DialogHeader>
        {code && <HistoryBody key={code.id} code={code} onRestored={onRestored} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ code, onRestored }: { code: QrCodeRecord; onRestored: (message: string) => void }) {
  const result = useLibraryQuery((db) => Promise.all([listVersions(db, code.id), db.qrCodes.get(code.id)]), [code.id]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!result) return <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" aria-label="Loading history" />;
  if (result.error) return <StatusMessage tone="error">{result.error.message}</StatusMessage>;

  const [versions, live] = result.data;
  const currentId = live?.currentVersionId ?? code.currentVersionId;
  const selected = versions.find((version) => version.id === selectedId) ?? versions.find((v) => v.id === currentId) ?? versions[0];
  const base = sanitizeFilename(code.name, "qr-code");

  const act = async (key: string, task: () => Promise<void>) => {
    setPending(key);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(toUserError(caught).message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <ol className="order-2 max-h-[50dvh] space-y-2 overflow-y-auto sm:order-1" aria-label="Versions">
        {versions.map((version) => {
          const isCurrent = version.id === currentId;
          const isSelected = version.id === selected?.id;
          return (
            <li key={version.id}>
              <button
                type="button"
                onClick={() => setSelectedId(version.id)}
                aria-pressed={isSelected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border border-border p-2.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isSelected && "border-primary bg-accent",
                )}
              >
                <QrImage config={toConfig(version)} alt="" className="size-12 shrink-0 rounded-lg p-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    Version {version.versionNumber}
                    {isCurrent && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Current</span>
                    )}
                    {version.restoredFromVersion && (
                      <span className="text-xs font-normal text-muted-foreground">restored from v{version.restoredFromVersion}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{version.content}</span>
                  <span className="block text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {selected && (
        <div className="order-1 space-y-3 sm:order-2">
          <QrImage config={toConfig(selected)} alt={`Version ${selected.versionNumber} preview`} className="p-2" />
          <p className="text-xs text-muted-foreground">
            v{selected.versionNumber} · ECC {selected.errorCorrectionLevel} · margin {selected.margin}
            {selected.transparentBackground ? " · transparent" : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() =>
                void act("png", async () => {
                  const { blob } = await renderPngBlob(toConfig(selected), 1024);
                  downloadBlob(blob, `${base}-v${selected.versionNumber}.png`);
                })
              }
            >
              <Download aria-hidden /> PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadBlob(svgBlob(toConfig(selected)), `${base}-v${selected.versionNumber}.svg`)}
            >
              <Download aria-hidden /> SVG
            </Button>
          </div>
          <Button
            className="w-full"
            disabled={selected.id === currentId || pending !== null}
            onClick={() =>
              void act("restore", async () => {
                const restored = await restoreVersion(getDb(), code.id, selected.id);
                setSelectedId(restored.version.id);
                onRestored(
                  restored.status === "created"
                    ? `Restored v${selected.versionNumber} as version ${restored.version.versionNumber}.`
                    : "That version already matches the current one.",
                );
              })
            }
          >
            {pending === "restore" ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
            {selected.id === currentId ? "Current version" : `Restore v${selected.versionNumber}`}
          </Button>
          {error && <StatusMessage tone="error">{error}</StatusMessage>}
        </div>
      )}
    </div>
  );
}
