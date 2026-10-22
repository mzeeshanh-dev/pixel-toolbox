"use client";

import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  Folder,
  FolderInput,
  FolderPlus,
  History,
  Home,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { qrLimits } from "@/config/limits";
import { Panel } from "@/components/tool/panel";
import { EmptyState, StatusMessage } from "@/components/tool/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDb, type FolderRecord, type QrCodeRecord, type QrVersionRecord } from "@/lib/db";
import { downloadBlob, sanitizeFilename } from "@/lib/download";
import { toUserError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QrImage } from "../components/qr-image";
import { flattenFolders, fromSelectValue, ROOT_VALUE, toSelectValue, useLibraryQuery } from "../hooks";
import { backupFileName, exportBackup } from "../lib/backup";
import { buildQrZip, type ExportFormat } from "../lib/export";
import { renderPngBlob, svgBlob, type QrRenderConfig } from "../lib/render";
import {
  collectDescendants,
  createFolder,
  deleteFolder,
  deleteQrCodes,
  duplicateQrCode,
  folderPath,
  MAX_FOLDER_NAME,
  moveFolder,
  moveQrCodes,
  renameFolder,
  renameQrCode,
  setFavorite,
} from "../lib/repository";
import { pickStyle } from "../lib/validation";
import { ConfirmDialog, DeleteFolderDialog, MoveDialog, NameDialog } from "./dialogs";
import { HistoryDialog } from "./history-dialog";
import { ImportDialog } from "./import-dialog";

type SortKey = "updated" | "created" | "name" | "favorites";

type DialogState =
  | { kind: "new-folder" }
  | { kind: "rename-folder"; folder: FolderRecord }
  | { kind: "move-folder"; folder: FolderRecord }
  | { kind: "delete-folder"; folder: FolderRecord }
  | { kind: "rename-code"; code: QrCodeRecord }
  | { kind: "move-codes"; ids: string[] }
  | { kind: "delete-codes"; ids: string[] }
  | { kind: "import" }
  | null;

interface LibraryData {
  folders: FolderRecord[];
  codes: QrCodeRecord[];
  versions: Map<string, QrVersionRecord>;
}

const toConfig = (version: QrVersionRecord): QrRenderConfig => ({ content: version.content, ...pickStyle(version) });

export function QrLibrary({
  onEdit,
  onCreateNew,
}: {
  onEdit: (code: QrCodeRecord, version: QrVersionRecord) => void;
  onCreateNew: (folderId: string | null) => void;
}) {
  const result = useLibraryQuery<LibraryData>(async (db) => {
    const [folders, codes] = await Promise.all([db.folders.toArray(), db.qrCodes.toArray()]);
    const versions = await db.versions.bulkGet(codes.map((code) => code.currentVersionId));
    return {
      folders,
      codes,
      versions: new Map(versions.filter((v): v is QrVersionRecord => Boolean(v)).map((v) => [v.qrCodeId, v])),
    };
  }, []);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [historyCode, setHistoryCode] = useState<QrCodeRecord | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const data = result?.data ?? null;
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const codes = useMemo(() => data?.codes ?? [], [data]);
  const currentFolder = folderId ? folders.find((folder) => folder.id === folderId) ?? null : null;
  // If the open folder disappears (deleted elsewhere), fall back to the root.
  const activeFolderId = currentFolder ? folderId : null;
  const flat = useMemo(() => flattenFolders(folders), [folders]);
  const path = folderPath(folders, activeFolderId);
  const searching = query.trim().length > 0;

  const visibleCodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? codes.filter(
          (code) =>
            code.name.toLowerCase().includes(needle) ||
            code.content.toLowerCase().includes(needle) ||
            code.tags.some((tag) => tag.includes(needle)),
        )
      : codes.filter((code) => code.folderId === activeFolderId);
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
      if (sort === "created") return b.createdAt - a.createdAt;
      if (sort === "favorites" && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    return sorted;
  }, [codes, query, sort, activeFolderId]);

  const subfolders = searching
    ? []
    : folders.filter((folder) => folder.parentId === activeFolderId).sort((a, b) => a.name.localeCompare(b.name));

  const visibleIds = visibleCodes.map((code) => code.id);
  const selectedIds = [...selected].filter((id) => codes.some((code) => code.id === id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const openFolder = (id: string | null) => {
    setFolderId(id);
    setSelected(new Set());
    setQuery("");
  };

  const act = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice({ tone: "success", message });
    } catch (error) {
      setNotice({ tone: "error", message: toUserError(error).message });
    } finally {
      setBusy(null);
    }
  };

  const configFor = (code: QrCodeRecord) => {
    const version = data?.versions.get(code.id);
    return version ? toConfig(version) : null;
  };

  const downloadZip = (ids: string[], formats: ExportFormat[]) =>
    act("zip", async () => {
      const entries = ids
        .map((id) => codes.find((code) => code.id === id))
        .filter((code): code is QrCodeRecord => Boolean(code))
        .flatMap((code) => {
          const config = configFor(code);
          return config ? [{ name: code.name, config }] : [];
        });
      if (!entries.length) return;
      const blob = await buildQrZip(entries, formats, 1024);
      downloadBlob(blob, `qr-codes-${new Date().toISOString().slice(0, 10)}.zip`);
      return `Downloaded ${entries.length} QR code${entries.length === 1 ? "" : "s"} as a ZIP.`;
    });

  const downloadOne = (code: QrCodeRecord, format: ExportFormat) =>
    act(`dl-${code.id}`, async () => {
      const config = configFor(code);
      if (!config) throw new Error("missing version");
      const base = sanitizeFilename(code.name, "qr-code");
      if (format === "svg") downloadBlob(svgBlob(config), `${base}.svg`);
      else downloadBlob((await renderPngBlob(config, 1024)).blob, `${base}.png`);
    });

  const exportAll = () =>
    act("export", async () => {
      const backup = await exportBackup(getDb());
      downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), backupFileName());
      return `Backup exported with ${backup.qrCodes.length} QR codes and ${backup.folders.length} folders.`;
    });

  if (!result) {
    return (
      <div className="grid place-items-center py-24" role="status" aria-label="Loading library">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (result.error) {
    return (
      <StatusMessage tone="error" title="Your QR library could not be opened">
        {result.error.message} Generating and downloading codes still works, but saving needs browser storage.
      </StatusMessage>
    );
  }

  const deleteCounts = (folder: FolderRecord) => {
    const nested = collectDescendants(folders, folder.id);
    const ids = new Set([folder.id, ...nested]);
    return { folders: nested.length, codes: codes.filter((code) => code.folderId && ids.has(code.folderId)).length };
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* Folder tree (desktop) */}
      <Panel as="aside" title="Folders" className="hidden lg:block" bodyClassName="p-2">
        <nav aria-label="Folders">
          <ul className="space-y-0.5">
            <li>
              <FolderButton active={activeFolderId === null && !searching} depth={0} onClick={() => openFolder(null)} count={codes.filter((c) => c.folderId === null).length}>
                <Home className="size-4" aria-hidden /> All codes
              </FolderButton>
            </li>
            {flat.map((option) => (
              <li key={option.id}>
                <FolderButton
                  active={activeFolderId === option.id && !searching}
                  depth={option.depth + 1}
                  onClick={() => openFolder(option.id)}
                  count={codes.filter((c) => c.folderId === option.id).length}
                >
                  <Folder className="size-4" aria-hidden />
                  <span className="truncate">{option.name}</span>
                </FolderButton>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => setDialog({ kind: "new-folder" })}>
            <FolderPlus aria-hidden /> New folder
          </Button>
        </nav>
      </Panel>

      <div className="min-w-0 space-y-4">
        {/* Header: breadcrumb + folder actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Folder path" className="min-w-0">
            <ol className="flex flex-wrap items-center gap-1 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => openFolder(null)}
                  className={cn("rounded-md px-1.5 py-1 hover:bg-accent", path.length === 0 ? "font-semibold" : "text-muted-foreground")}
                >
                  All codes
                </button>
              </li>
              {path.map((folder, index) => (
                <li key={folder.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  <button
                    type="button"
                    onClick={() => openFolder(folder.id)}
                    aria-current={index === path.length - 1 ? "page" : undefined}
                    className={cn("max-w-40 truncate rounded-md px-1.5 py-1 hover:bg-accent", index === path.length - 1 ? "font-semibold" : "text-muted-foreground")}
                  >
                    {folder.name}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {currentFolder && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Folder aria-hidden /> Folder <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "rename-folder", folder: currentFolder })}>
                    <PencilLine aria-hidden /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "move-folder", folder: currentFolder })}>
                    <FolderInput aria-hidden /> Move
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete-folder", folder: currentFolder })}>
                    <Trash2 aria-hidden /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "new-folder" })}>
              <FolderPlus aria-hidden /> <span className="hidden sm:inline">New folder</span>
              <span className="sm:hidden">Folder</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy === "export"}>
                  <ArchiveRestore aria-hidden /> Backup
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportAll()}>
                  <Download aria-hidden /> Export backup (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog({ kind: "import" })}>
                  <Upload aria-hidden /> Import backup…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile folder picker */}
        <div className="lg:hidden">
          <Select value={toSelectValue(activeFolderId)} onValueChange={(value) => openFolder(fromSelectValue(value))}>
            <SelectTrigger aria-label="Browse folder" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>
                <Home aria-hidden /> All codes (root)
              </SelectItem>
              {flat.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  <span style={{ paddingLeft: option.depth * 12 }} className="inline-flex items-center gap-2">
                    <Folder aria-hidden className="size-4 text-muted-foreground" /> {option.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search + sort */}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names, content and tags in all folders"
              aria-label="Search QR codes"
              className="h-10 pl-9"
            />
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
            <SelectTrigger aria-label="Sort by" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="created">Recently created</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="favorites">Favourites first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div aria-live="polite">{notice && <StatusMessage tone={notice.tone}>{notice.message}</StatusMessage>}</div>

        {/* Subfolders */}
        {subfolders.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Subfolders">
            {subfolders.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  onClick={() => openFolder(folder.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-sm font-medium shadow-soft outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Folder className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{folder.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Selection toolbar */}
        {visibleCodes.length > 0 && (
          <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allVisibleSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? new Set([...selected, ...visibleIds]) : new Set())
                }
                aria-label="Select all visible codes"
              />
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : searching ? `${visibleCodes.length} results in all folders` : `${visibleCodes.length} codes`}
            </label>
            {selectedIds.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "move-codes", ids: selectedIds })}>
                  <FolderInput aria-hidden /> Move
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={busy === "zip"}>
                      {busy === "zip" ? <Loader2 className="animate-spin" aria-hidden /> : <FileArchive aria-hidden />} ZIP
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Download {selectedIds.length} as ZIP</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void downloadZip(selectedIds, ["png", "svg"])}>PNG + SVG</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void downloadZip(selectedIds, ["png"])}>PNG only (1024 px)</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void downloadZip(selectedIds, ["svg"])}>SVG only</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDialog({ kind: "delete-codes", ids: selectedIds })}>
                  <Trash2 aria-hidden /> Delete
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                  <X aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Codes */}
        {visibleCodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-input">
            <EmptyState
              icon={searching ? <Search aria-hidden /> : <Folder aria-hidden />}
              title={searching ? "No codes match your search" : codes.length === 0 ? "Your library is empty" : "No codes in this folder"}
              action={
                !searching && (
                  <Button onClick={() => onCreateNew(activeFolderId)}>
                    Create a QR code{currentFolder ? " here" : ""}
                  </Button>
                )
              }
            >
              {searching
                ? "Try a different name, URL or tag."
                : "Saved codes stay in this browser. Export a backup now and then to keep a copy."}
            </EmptyState>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="QR codes">
            {visibleCodes.map((code) => {
              const version = data?.versions.get(code.id);
              const isSelected = selected.has(code.id);
              const folderName = searching && code.folderId ? folders.find((f) => f.id === code.folderId)?.name : null;
              return (
                <li
                  key={code.id}
                  className={cn(
                    "group relative flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft transition-colors",
                    isSelected && "border-primary ring-1 ring-primary",
                  )}
                >
                  <div className="relative shrink-0">
                    {version ? (
                      <QrImage config={toConfig(version)} alt={`QR code ${code.name}`} className="size-20 rounded-lg p-1" />
                    ) : (
                      <div className="size-20 rounded-lg bg-muted" />
                    )}
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => toggle(code.id, checked === true)}
                      aria-label={`Select ${code.name}`}
                      className="absolute top-1 left-1 bg-card"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start gap-1">
                      <button
                        type="button"
                        onClick={() => version && onEdit(code, version)}
                        className="min-w-0 flex-1 truncate rounded text-left text-sm font-semibold outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        title={`Edit ${code.name}`}
                      >
                        {code.name}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={code.favorite ? `Remove ${code.name} from favourites` : `Add ${code.name} to favourites`}
                        aria-pressed={code.favorite}
                        onClick={() => void act(`fav-${code.id}`, () => setFavorite(getDb(), code.id, !code.favorite))}
                      >
                        <Star className={cn(code.favorite && "fill-warning text-warning")} aria-hidden />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${code.name}`}>
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled={!version} onSelect={() => version && onEdit(code, version)}>
                            <PencilLine aria-hidden /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDialog({ kind: "rename-code", code })}>
                            <PencilLine aria-hidden /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              void act("dup", async () => {
                                const copy = await duplicateQrCode(getDb(), code.id);
                                return `Created “${copy.code.name}”.`;
                              })
                            }
                          >
                            <Copy aria-hidden /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setHistoryCode(code)}>
                            <History aria-hidden /> Version history
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setDialog({ kind: "move-codes", ids: [code.id] })}>
                            <FolderInput aria-hidden /> Move to…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => void downloadOne(code, "png")}>
                            <Download aria-hidden /> Download PNG
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => void downloadOne(code, "svg")}>
                            <Download aria-hidden /> Download SVG
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete-codes", ids: [code.id] })}>
                            <Trash2 aria-hidden /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="truncate text-xs text-muted-foreground" title={code.content}>
                      {code.content}
                    </p>
                    <p className="mt-auto pt-2 text-xs text-muted-foreground">
                      {version ? `v${version.versionNumber}` : "—"} · {formatDateTime(code.updatedAt)}
                      {folderName && (
                        <span className="ml-1 inline-flex items-center gap-1">
                          · <Folder className="size-3" aria-hidden /> {folderName}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Your library is stored in this browser (IndexedDB). Clearing site data or switching devices removes it — use Backup →
          Export to keep a copy.
        </p>
      </div>

      {/* Dialogs */}
      <NameDialog
        open={dialog?.kind === "new-folder"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="New folder"
        description={currentFolder ? `Created inside “${currentFolder.name}”.` : "Created at the top level of your library."}
        label="Folder name"
        submitLabel="Create folder"
        maxLength={MAX_FOLDER_NAME}
        onSubmit={async (name) => {
          const folder = await createFolder(getDb(), name, activeFolderId);
          setNotice({ tone: "success", message: `Folder “${folder.name}” created.` });
        }}
      />
      <NameDialog
        open={dialog?.kind === "rename-folder"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rename folder"
        label="Folder name"
        initialValue={dialog?.kind === "rename-folder" ? dialog.folder.name : ""}
        submitLabel="Rename"
        maxLength={MAX_FOLDER_NAME}
        onSubmit={async (name) => {
          if (dialog?.kind === "rename-folder") await renameFolder(getDb(), dialog.folder.id, name);
        }}
      />
      <NameDialog
        open={dialog?.kind === "rename-code"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Rename QR code"
        description="Renaming does not create a new version."
        label="Name"
        initialValue={dialog?.kind === "rename-code" ? dialog.code.name : ""}
        submitLabel="Rename"
        maxLength={qrLimits.maxNameLength}
        onSubmit={async (name) => {
          if (dialog?.kind === "rename-code") await renameQrCode(getDb(), dialog.code.id, name);
        }}
      />
      <MoveDialog
        open={dialog?.kind === "move-codes"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "move-codes" && dialog.ids.length > 1 ? `Move ${dialog.ids.length} codes` : "Move QR code"}
        description="Choose the destination folder."
        initialFolderId={activeFolderId}
        onSubmit={async (target) => {
          if (dialog?.kind !== "move-codes") return;
          await moveQrCodes(getDb(), dialog.ids, target);
          setSelected(new Set());
          setNotice({ tone: "success", message: `Moved ${dialog.ids.length} code${dialog.ids.length === 1 ? "" : "s"}.` });
        }}
      />
      <MoveDialog
        open={dialog?.kind === "move-folder"}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Move folder"
        description="A folder cannot be moved into itself or one of its subfolders."
        initialFolderId={dialog?.kind === "move-folder" ? dialog.folder.parentId : null}
        disabledIds={
          dialog?.kind === "move-folder"
            ? new Set([dialog.folder.id, ...collectDescendants(folders, dialog.folder.id)])
            : undefined
        }
        onSubmit={async (target) => {
          if (dialog?.kind === "move-folder") await moveFolder(getDb(), dialog.folder.id, target);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete-codes"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === "delete-codes" && dialog.ids.length > 1 ? `Delete ${dialog.ids.length} QR codes?` : "Delete this QR code?"}
        description="The codes and their full version history will be permanently removed from this browser."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (dialog?.kind !== "delete-codes") return;
          await deleteQrCodes(getDb(), dialog.ids);
          setSelected((current) => new Set([...current].filter((id) => !dialog.ids.includes(id))));
          setNotice({ tone: "success", message: `Deleted ${dialog.ids.length} code${dialog.ids.length === 1 ? "" : "s"}.` });
        }}
      />
      {dialog?.kind === "delete-folder" && (
        <DeleteFolderDialog
          key={dialog.folder.id}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          folderName={dialog.folder.name}
          counts={deleteCounts(dialog.folder)}
          onConfirm={async (policy) => {
            await deleteFolder(getDb(), dialog.folder.id, policy);
            openFolder(dialog.folder.parentId);
            setNotice({ tone: "success", message: `Folder “${dialog.folder.name}” deleted.` });
          }}
        />
      )}
      <ImportDialog
        open={dialog?.kind === "import"}
        onOpenChange={(open) => !open && setDialog(null)}
        onImported={(message) => setNotice({ tone: "success", message })}
      />
      <HistoryDialog
        code={historyCode}
        onOpenChange={(open) => !open && setHistoryCode(null)}
        onRestored={(message) => setNotice({ tone: "success", message })}
      />
    </div>
  );
}

function FolderButton({
  active,
  depth,
  count,
  onClick,
  children,
}: {
  active: boolean;
  depth: number;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      style={{ paddingLeft: 8 + depth * 12 }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "bg-accent font-medium text-foreground",
      )}
    >
      {children}
      <span className="ml-auto text-xs tabular">{count || ""}</span>
    </button>
  );
}
