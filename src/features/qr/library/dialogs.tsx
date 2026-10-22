"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, useField } from "@/components/tool/field";
import { StatusMessage } from "@/components/tool/status";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toUserError } from "@/lib/errors";
import { FolderSelect } from "../components/folder-select";
import type { FolderDeletePolicy } from "../lib/repository";

/** Runs an async action, keeping the dialog open with an inline error if it fails. */
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, onDone: () => void) => {
    setPending(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (caught) {
      setError(toUserError(caught).message);
    } finally {
      setPending(false);
    }
  };
  return { pending, error, setError, run };
}

function NameInput(props: React.ComponentProps<typeof Input>) {
  const field = useField();
  return <Input {...field} {...props} />;
}

export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue = "",
  submitLabel,
  maxLength,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  submitLabel: string;
  maxLength: number;
  onSubmit: (value: string) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remount the form each time the dialog opens so it starts from initialValue. */}
        {open && (
          <NameForm
            title={title}
            description={description}
            label={label}
            initialValue={initialValue}
            submitLabel={submitLabel}
            maxLength={maxLength}
            onSubmit={onSubmit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  description,
  label,
  initialValue,
  submitLabel,
  maxLength,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  maxLength: number;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const { pending, error, run } = useAction();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => onSubmit(value), onClose);
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{label}</DialogDescription>}
      </DialogHeader>
      <Field label={label} error={error}>
        <NameInput value={value} onChange={(event) => setValue(event.target.value)} maxLength={maxLength} autoFocus className="h-10" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MoveDialog({
  open,
  onOpenChange,
  title,
  description,
  initialFolderId,
  disabledIds,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialFolderId: string | null;
  disabledIds?: Set<string>;
  onSubmit: (folderId: string | null) => Promise<void>;
}) {
  const [target, setTarget] = useState<string | null>(initialFolderId);
  const [lastOpen, setLastOpen] = useState(open);
  const { pending, error, setError, run } = useAction();
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(initialFolderId);
      setError(null);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label="Destination" error={error}>
          <FolderSelect value={target} onChange={setTarget} disabledIds={disabledIds} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => void run(() => onSubmit(target), () => onOpenChange(false))}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const { pending, error, run } = useAction();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void run(onConfirm, () => onOpenChange(false))}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteFolderDialog({
  open,
  onOpenChange,
  folderName,
  counts,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  counts: { folders: number; codes: number };
  onConfirm: (policy: FolderDeletePolicy) => Promise<void>;
}) {
  const [policy, setPolicy] = useState<FolderDeletePolicy>("move-to-parent");
  const { pending, error, run } = useAction();
  const empty = counts.folders === 0 && counts.codes === 0;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{folderName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {empty
              ? "This folder is empty."
              : `It contains ${counts.codes} QR code${counts.codes === 1 ? "" : "s"} and ${counts.folders} subfolder${counts.folders === 1 ? "" : "s"} (including nested ones). Choose what happens to them.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!empty && (
          <RadioGroup value={policy} onValueChange={(value) => setPolicy(value as FolderDeletePolicy)} className="gap-2">
            <Label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 font-normal has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="move-to-parent" className="mt-0.5" />
              <span>
                <span className="block font-medium">Keep contents</span>
                <span className="text-xs text-muted-foreground">Move its codes and subfolders up one level.</span>
              </span>
            </Label>
            <Label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 font-normal has-[[data-state=checked]]:border-destructive">
              <RadioGroupItem value="delete-all" className="mt-0.5" />
              <span>
                <span className="block font-medium text-destructive">Delete everything inside</span>
                <span className="text-xs text-muted-foreground">Permanently removes all nested folders, codes and version history.</span>
              </span>
            </Label>
          </RadioGroup>
        )}
        {error && <StatusMessage tone="error">{error}</StatusMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => void run(() => onConfirm(policy), () => onOpenChange(false))}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Delete folder
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
