"use client";

import { useState } from "react";
import { FileJson, Loader2 } from "lucide-react";
import { qrLimits } from "@/config/limits";
import { FileDropzone } from "@/components/tool/file-dropzone";
import { StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getDb } from "@/lib/db";
import { AppError, toUserError } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { analyzeImport, applyImport, parseBackup, type ImportAnalysis, type ImportMode, type QrBackup } from "../lib/backup";

type Stage =
  | { step: "pick"; error?: string }
  | { step: "reading" }
  | { step: "preview"; fileName: string; backup: QrBackup; analysis: ImportAnalysis; error?: string }
  | { step: "importing"; fileName: string; backup: QrBackup; analysis: ImportAnalysis };

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (message: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import backup</DialogTitle>
          <DialogDescription>Review what a backup contains before anything is added. Existing codes are never overwritten.</DialogDescription>
        </DialogHeader>
        {open && <ImportBody onClose={() => onOpenChange(false)} onImported={onImported} />}
      </DialogContent>
    </Dialog>
  );
}

function ImportBody({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [stage, setStage] = useState<Stage>({ step: "pick" });
  const [mode, setMode] = useState<ImportMode>("merge");

  const readFile = async (file: File) => {
    setStage({ step: "reading" });
    try {
      if (file.size > qrLimits.maxBackupBytes) {
        throw new AppError("FILE_TOO_LARGE", `Backups can be up to ${formatBytes(qrLimits.maxBackupBytes, 0)}.`);
      }
      const backup = parseBackup(await file.text());
      const analysis = await analyzeImport(getDb(), backup);
      setMode(analysis.hasConflicts ? "copies" : "merge");
      setStage({ step: "preview", fileName: file.name, backup, analysis });
    } catch (error) {
      setStage({ step: "pick", error: toUserError(error).message });
    }
  };

  if (stage.step === "pick" || stage.step === "reading") {
    return (
      <div className="space-y-3">
        <FileDropzone
          compact
          accept="application/json,.json"
          title="Choose a backup file"
          limits={`Pixel Toolbox QR backup (.json) · up to ${formatBytes(qrLimits.maxBackupBytes, 0)}`}
          icon={stage.step === "reading" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileJson className="size-5" aria-hidden />}
          onFile={(file) => void readFile(file)}
          disabled={stage.step === "reading"}
          inputLabel="Backup file"
        />
        {stage.step === "pick" && stage.error && (
          <StatusMessage tone="error" title="This backup cannot be imported">
            {stage.error}
          </StatusMessage>
        )}
      </div>
    );
  }

  const { analysis, backup, fileName } = stage;
  const importing = stage.step === "importing";
  const runImport = async () => {
    setStage({ ...stage, step: "importing" });
    try {
      const result = await applyImport(getDb(), backup, mode);
      onImported(
        `Imported ${result.qrCodes} QR code${result.qrCodes === 1 ? "" : "s"}, ${result.folders} folder${result.folders === 1 ? "" : "s"} and ${result.versions} version${result.versions === 1 ? "" : "s"}` +
          (result.skipped ? ` (${result.skipped} existing record${result.skipped === 1 ? "" : "s"} kept unchanged).` : "."),
      );
      onClose();
    } catch (error) {
      setStage({ step: "preview", fileName, backup, analysis, error: toUserError(error).message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-3.5 text-sm">
        <p className="truncate font-medium">{fileName}</p>
        <p className="text-muted-foreground">
          {analysis.counts.qrCodes} QR codes · {analysis.counts.folders} folders · {analysis.counts.versions} versions · exported{" "}
          {new Date(backup.exportedAt).toLocaleDateString()}
        </p>
      </div>
      {analysis.hasConflicts ? (
        <StatusMessage tone="warning" title="Some records already exist in your library">
          {analysis.conflicts.qrCodes} QR codes, {analysis.conflicts.folders} folders and {analysis.conflicts.versions} versions have
          the same IDs as items you already have.
        </StatusMessage>
      ) : (
        <StatusMessage tone="success">No conflicts with your current library.</StatusMessage>
      )}
      <RadioGroup value={mode} onValueChange={(value) => setMode(value as ImportMode)} className="gap-2" aria-label="Import mode">
        <Label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 font-normal has-[[data-state=checked]]:border-primary">
          <RadioGroupItem value="merge" className="mt-0.5" />
          <span>
            <span className="block font-medium">Merge</span>
            <span className="text-xs text-muted-foreground">Add new items only. Items that already exist are kept exactly as they are.</span>
          </span>
        </Label>
        <Label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 font-normal has-[[data-state=checked]]:border-primary">
          <RadioGroupItem value="copies" className="mt-0.5" />
          <span>
            <span className="block font-medium">Import as copies</span>
            <span className="text-xs text-muted-foreground">Add everything with new IDs. Clashing names get a number suffix.</span>
          </span>
        </Label>
      </RadioGroup>
      {stage.step === "preview" && stage.error && <StatusMessage tone="error">{stage.error}</StatusMessage>}
      <DialogFooter>
        <Button variant="outline" onClick={() => setStage({ step: "pick" })} disabled={importing}>
          Choose another file
        </Button>
        <Button onClick={() => void runImport()} disabled={importing}>
          {importing && <Loader2 className="animate-spin" aria-hidden />}
          Import
        </Button>
      </DialogFooter>
    </div>
  );
}
