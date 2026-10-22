import { z } from "zod";
import { qrLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import { newId, type FolderRecord, type PixelToolboxDatabase, type QrCodeRecord, type QrVersionRecord } from "@/lib/db";
import { MAX_FOLDER_NAME, uniqueName } from "./repository";
import { hexColorSchema, errorCorrectionLevels } from "./validation";

export const BACKUP_FORMAT = "pixel-toolbox-qr-backup";
export const BACKUP_SCHEMA_VERSION = 1;

const id = z.string().min(1).max(100);
const timestamp = z.number().int().nonnegative();

const folderSchema = z.object({
  id,
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
  parentId: id.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const qrCodeSchema = z.object({
  id,
  name: z.string().max(qrLimits.maxNameLength),
  content: z.string().min(1).max(qrLimits.maxContentBytes * 4),
  folderId: id.nullable(),
  currentVersionId: id,
  favorite: z.boolean().default(false),
  tags: z.array(z.string().max(40)).max(20).default([]),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const versionSchema = z.object({
  id,
  qrCodeId: id,
  versionNumber: z.number().int().min(1),
  content: z.string().min(1).max(qrLimits.maxContentBytes * 4),
  foregroundColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  transparentBackground: z.boolean(),
  errorCorrectionLevel: z.enum(errorCorrectionLevels),
  margin: z.number().int().min(qrLimits.minMargin).max(qrLimits.maxMargin),
  restoredFromVersion: z.number().int().min(1).optional(),
  createdAt: timestamp,
});

/** Versioned backup schema. Add a `schemaVersion: 2` branch here when the format changes. */
export const backupSchemaV1 = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  folders: z.array(folderSchema).max(10_000),
  qrCodes: z.array(qrCodeSchema).max(50_000),
  versions: z.array(versionSchema).max(500_000),
});

export type QrBackup = z.infer<typeof backupSchemaV1>;

export async function exportBackup(db: PixelToolboxDatabase): Promise<QrBackup> {
  return db.transaction("r", db.folders, db.qrCodes, db.versions, async () => ({
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    folders: await db.folders.toArray(),
    qrCodes: await db.qrCodes.toArray(),
    versions: await db.versions.toArray(),
  })) as Promise<QrBackup>;
}

export function backupFileName(date = new Date()): string {
  return `pixel-toolbox-qr-backup-${date.toISOString().slice(0, 10)}.json`;
}

/** Parses and validates backup JSON, including referential integrity. Throws AppError with a readable reason. */
export function parseBackup(text: string): QrBackup {
  if (new Blob([text]).size > qrLimits.maxBackupBytes) {
    throw new AppError("FILE_TOO_LARGE", "This backup file is larger than the 20 MB import limit.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError("INVALID_FILE", "This file is not valid JSON.");
  }
  if (!json || typeof json !== "object" || (json as { format?: unknown }).format !== BACKUP_FORMAT) {
    throw new AppError("UNSUPPORTED_FORMAT", "This is not a Pixel Toolbox QR backup.");
  }
  const version = (json as { schemaVersion?: unknown }).schemaVersion;
  if (version !== BACKUP_SCHEMA_VERSION) {
    throw new AppError(
      "UNSUPPORTED_FORMAT",
      typeof version === "number" && version > BACKUP_SCHEMA_VERSION
        ? "This backup was made by a newer version of Pixel Toolbox."
        : "This backup version is not supported.",
    );
  }
  const result = backupSchemaV1.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (at ${issue.path.join(".")})` : "";
    throw new AppError("INVALID_FILE", `The backup contains invalid data${where}: ${issue.message}`);
  }
  assertIntegrity(result.data);
  return result.data;
}

function assertIntegrity(backup: QrBackup) {
  const unique = (ids: string[], label: string) => {
    if (new Set(ids).size !== ids.length) throw new AppError("INVALID_FILE", `The backup contains duplicate ${label} IDs.`);
  };
  unique(backup.folders.map((f) => f.id), "folder");
  unique(backup.qrCodes.map((q) => q.id), "QR code");
  unique(backup.versions.map((v) => v.id), "version");

  const folderIds = new Set(backup.folders.map((f) => f.id));
  const byId = new Map(backup.folders.map((f) => [f.id, f]));
  for (const folder of backup.folders) {
    if (folder.parentId && !folderIds.has(folder.parentId)) {
      throw new AppError("INVALID_FILE", `Folder “${folder.name}” refers to a parent folder that is not in the backup.`);
    }
    // Cycle check: walk up at most folders.length steps.
    let current: FolderRecord | undefined = folder;
    for (let steps = 0; current?.parentId; steps += 1) {
      if (steps > backup.folders.length) throw new AppError("INVALID_FILE", "The backup's folders contain a cycle.");
      current = byId.get(current.parentId);
    }
  }
  const versionsById = new Map(backup.versions.map((v) => [v.id, v]));
  const codeIds = new Set(backup.qrCodes.map((q) => q.id));
  for (const code of backup.qrCodes) {
    if (code.folderId && !folderIds.has(code.folderId)) {
      throw new AppError("INVALID_FILE", `QR code “${code.name}” refers to a folder that is not in the backup.`);
    }
    const current = versionsById.get(code.currentVersionId);
    if (!current || current.qrCodeId !== code.id) {
      throw new AppError("INVALID_FILE", `QR code “${code.name}” is missing its current version.`);
    }
  }
  for (const version of backup.versions) {
    if (!codeIds.has(version.qrCodeId)) throw new AppError("INVALID_FILE", "A version refers to a QR code that is not in the backup.");
  }
}

export interface ImportAnalysis {
  counts: { folders: number; qrCodes: number; versions: number };
  conflicts: { folders: number; qrCodes: number; versions: number };
  hasConflicts: boolean;
}

/** Compares the backup with the current library without changing anything. */
export async function analyzeImport(db: PixelToolboxDatabase, backup: QrBackup): Promise<ImportAnalysis> {
  const [folders, qrCodes, versions] = await Promise.all([
    db.folders.bulkGet(backup.folders.map((f) => f.id)),
    db.qrCodes.bulkGet(backup.qrCodes.map((q) => q.id)),
    db.versions.bulkGet(backup.versions.map((v) => v.id)),
  ]);
  const conflicts = {
    folders: folders.filter(Boolean).length,
    qrCodes: qrCodes.filter(Boolean).length,
    versions: versions.filter(Boolean).length,
  };
  return {
    counts: { folders: backup.folders.length, qrCodes: backup.qrCodes.length, versions: backup.versions.length },
    conflicts,
    hasConflicts: conflicts.folders + conflicts.qrCodes + conflicts.versions > 0,
  };
}

/**
 * - "merge": adds records whose IDs are new; existing records are kept untouched. A QR code is
 *   imported together with its versions, so an existing code skips all of its backup versions.
 * - "copies": every record gets a fresh ID (relationships preserved), so nothing can collide.
 * Names are suffixed where they would clash with an existing sibling. Runs in one transaction.
 */
export type ImportMode = "merge" | "copies";

export interface ImportResult {
  folders: number;
  qrCodes: number;
  versions: number;
  skipped: number;
}

export async function applyImport(db: PixelToolboxDatabase, backup: QrBackup, mode: ImportMode): Promise<ImportResult> {
  return db.transaction("rw", db.folders, db.qrCodes, db.versions, async () => {
    const result: ImportResult = { folders: 0, qrCodes: 0, versions: 0, skipped: 0 };
    const existingFolders = await db.folders.toArray();
    const existingCodes = await db.qrCodes.toArray();
    const existingFolderIds = new Set(existingFolders.map((f) => f.id));
    const existingCodeIds = new Set(existingCodes.map((q) => q.id));

    const remap = new Map<string, string>();
    const mapId = (value: string) => {
      if (mode === "merge") return value;
      let next = remap.get(value);
      if (!next) {
        next = newId();
        remap.set(value, next);
      }
      return next;
    };

    // Names already used per parent, for suffixing.
    const folderNames = new Map<string, string[]>();
    const keyOf = (parent: string | null) => parent ?? "\u0000root";
    for (const folder of existingFolders) {
      const list = folderNames.get(keyOf(folder.parentId)) ?? [];
      list.push(folder.name);
      folderNames.set(keyOf(folder.parentId), list);
    }

    // Parents before children so names are checked against the final tree.
    const ordered = topologicalFolders(backup.folders);
    for (const folder of ordered) {
      if (mode === "merge" && existingFolderIds.has(folder.id)) {
        result.skipped += 1;
        continue;
      }
      const parentId = folder.parentId ? mapId(folder.parentId) : null;
      const siblings = folderNames.get(keyOf(parentId)) ?? [];
      const name = uniqueName(folder.name, siblings);
      siblings.push(name);
      folderNames.set(keyOf(parentId), siblings);
      const record: FolderRecord = { ...folder, id: mapId(folder.id), parentId, name };
      await db.folders.add(record);
      result.folders += 1;
    }

    const codeNames = new Map<string, string[]>();
    for (const code of existingCodes) {
      const list = codeNames.get(keyOf(code.folderId)) ?? [];
      list.push(code.name);
      codeNames.set(keyOf(code.folderId), list);
    }
    const versionsByCode = new Map<string, QrVersionRecord[]>();
    for (const version of backup.versions) {
      const list = versionsByCode.get(version.qrCodeId) ?? [];
      list.push(version as QrVersionRecord);
      versionsByCode.set(version.qrCodeId, list);
    }

    for (const code of backup.qrCodes) {
      const versions = versionsByCode.get(code.id) ?? [];
      if (mode === "merge" && existingCodeIds.has(code.id)) {
        result.skipped += 1 + versions.length;
        continue;
      }
      const codeId = mapId(code.id);
      const folderId = code.folderId ? mapId(code.folderId) : null;
      const siblings = codeNames.get(keyOf(folderId)) ?? [];
      const name = uniqueName(code.name || "QR code", siblings);
      siblings.push(name);
      codeNames.set(keyOf(folderId), siblings);

      const versionIds = new Map<string, string>();
      for (const version of versions) {
        // A version ID can only collide if a foreign database reused it; give it a new one then.
        const existing = mode === "merge" ? await db.versions.get(version.id) : undefined;
        const versionId = mode === "copies" || existing ? newId() : version.id;
        versionIds.set(version.id, versionId);
        await db.versions.add({ ...version, id: versionId, qrCodeId: codeId });
        result.versions += 1;
      }
      const record: QrCodeRecord = {
        ...code,
        id: codeId,
        folderId,
        name,
        currentVersionId: versionIds.get(code.currentVersionId) as string,
      };
      await db.qrCodes.add(record);
      result.qrCodes += 1;
    }
    return result;
  });
}

function topologicalFolders<T extends { id: string; parentId: string | null }>(folders: T[]): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depth = (folder: T) => {
    let d = 0;
    let current: T | undefined = folder;
    while (current?.parentId && d <= folders.length) {
      current = byId.get(current.parentId);
      d += 1;
    }
    return d;
  };
  return [...folders].sort((a, b) => depth(a) - depth(b));
}
