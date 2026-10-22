import { qrLimits } from "@/config/limits";
import { AppError } from "@/lib/errors";
import {
  newId,
  type FolderRecord,
  type PixelToolboxDatabase,
  type QrCodeRecord,
  type QrStyle,
  type QrVersionRecord,
} from "@/lib/db";
import { normalizeStyle, pickStyle, qrStyleSchema, sameStyle } from "./validation";

/**
 * QR library data layer. Every multi-table write runs in a single Dexie transaction.
 *
 * Policies:
 * - A new version is created only when content or style really changes; otherwise "unchanged".
 * - Renaming, moving and favouriting never create versions.
 * - Restoring an old version appends a new version (history is never rewritten).
 * - Sibling folder names are unique (case-insensitive); QR names may repeat, but
 *   duplicates and imports get a " (copy)" / " (2)" suffix to stay distinguishable.
 * - Deleting a folder either moves its contents to the parent or deletes everything inside.
 */

export const MAX_FOLDER_NAME = 80;

export interface QrDraft {
  name: string;
  content: string;
  style: QrStyle;
  folderId?: string | null;
}

export interface QrWithVersion {
  code: QrCodeRecord;
  version: QrVersionRecord;
}

function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return (trimmed || fallback).slice(0, qrLimits.maxNameLength);
}

function assertStyle(style: QrStyle): QrStyle {
  const parsed = qrStyleSchema.safeParse(style);
  if (!parsed.success) throw new AppError("INVALID_SETTINGS", "The QR style contains invalid values.");
  return normalizeStyle(parsed.data);
}

function assertContent(content: string): string {
  if (!content.trim()) throw new AppError("INVALID_SETTINGS", "QR content cannot be empty.", { field: "content" });
  return content;
}

async function assertFolderExists(db: PixelToolboxDatabase, folderId: string | null | undefined) {
  if (!folderId) return;
  if (!(await db.folders.get(folderId))) throw new AppError("NOT_FOUND", "The selected folder no longer exists.");
}

/** Returns `base`, or `base (2)`, `base (3)`… so it does not collide with `taken` (case-insensitive). */
export function uniqueName(base: string, taken: Iterable<string>, style: "copy" | "number" = "number"): string {
  const lower = new Set([...taken].map((name) => name.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = style === "copy" ? 1 : 2; n < 10_000; n += 1) {
    const candidate =
      style === "copy" ? (n === 1 ? `${base} (copy)` : `${base} (copy ${n})`) : `${base} (${n})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${newId().slice(0, 6)})`;
}

// ---------------------------------------------------------------- QR codes

export async function createQrCode(db: PixelToolboxDatabase, draft: QrDraft): Promise<QrWithVersion> {
  const style = assertStyle(draft.style);
  const content = assertContent(draft.content);
  const now = Date.now();
  const codeId = newId();
  const version: QrVersionRecord = { id: newId(), qrCodeId: codeId, versionNumber: 1, content, ...style, createdAt: now };
  const code: QrCodeRecord = {
    id: codeId,
    name: cleanName(draft.name, "QR code"),
    content,
    folderId: draft.folderId ?? null,
    currentVersionId: version.id,
    favorite: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction("rw", db.qrCodes, db.versions, db.folders, async () => {
    await assertFolderExists(db, code.folderId);
    await db.qrCodes.add(code);
    await db.versions.add(version);
  });
  return { code, version };
}

export async function createQrCodes(db: PixelToolboxDatabase, drafts: QrDraft[]): Promise<number> {
  let created = 0;
  await db.transaction("rw", db.qrCodes, db.versions, db.folders, async () => {
    for (const draft of drafts) {
      await createQrCode(db, draft);
      created += 1;
    }
  });
  return created;
}

export async function getQrWithVersion(db: PixelToolboxDatabase, id: string): Promise<QrWithVersion> {
  const code = await db.qrCodes.get(id);
  if (!code) throw new AppError("NOT_FOUND", "This QR code no longer exists.");
  const version = await db.versions.get(code.currentVersionId);
  if (!version) throw new AppError("NOT_FOUND", "The current version of this QR code is missing.");
  return { code, version };
}

export type SaveResult = { status: "created"; version: QrVersionRecord } | { status: "unchanged"; version: QrVersionRecord };

/** Appends a version only if content or style differ from the current version. */
export async function saveQrVersion(
  db: PixelToolboxDatabase,
  id: string,
  change: { content: string; style: QrStyle; restoredFromVersion?: number },
): Promise<SaveResult> {
  const style = assertStyle(change.style);
  const content = assertContent(change.content);
  return db.transaction("rw", db.qrCodes, db.versions, async () => {
    const { code, version: current } = await getQrWithVersion(db, id);
    if (current.content === content && sameStyle(current, style)) {
      return { status: "unchanged", version: current } as const;
    }
    const last = await db.versions.where("[qrCodeId+versionNumber]").between([id, 0], [id, Infinity]).last();
    const now = Date.now();
    const version: QrVersionRecord = {
      id: newId(),
      qrCodeId: id,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      content,
      ...style,
      ...(change.restoredFromVersion ? { restoredFromVersion: change.restoredFromVersion } : {}),
      createdAt: now,
    };
    await db.versions.add(version);
    await db.qrCodes.update(code.id, { currentVersionId: version.id, content, updatedAt: now });
    return { status: "created", version } as const;
  });
}

export async function restoreVersion(db: PixelToolboxDatabase, qrCodeId: string, versionId: string): Promise<SaveResult> {
  const old = await db.versions.get(versionId);
  if (!old || old.qrCodeId !== qrCodeId) throw new AppError("NOT_FOUND", "That version no longer exists.");
  return saveQrVersion(db, qrCodeId, {
    content: old.content,
    style: pickStyle(old),
    restoredFromVersion: old.versionNumber,
  });
}

export async function listVersions(db: PixelToolboxDatabase, qrCodeId: string): Promise<QrVersionRecord[]> {
  const versions = await db.versions.where("qrCodeId").equals(qrCodeId).toArray();
  return versions.sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function renameQrCode(db: PixelToolboxDatabase, id: string, name: string): Promise<void> {
  const cleaned = cleanName(name, "");
  if (!cleaned) throw new AppError("INVALID_SETTINGS", "Enter a name.", { field: "name" });
  const updated = await db.qrCodes.update(id, { name: cleaned, updatedAt: Date.now() });
  if (!updated) throw new AppError("NOT_FOUND", "This QR code no longer exists.");
}

export async function setFavorite(db: PixelToolboxDatabase, id: string, favorite: boolean): Promise<void> {
  await db.qrCodes.update(id, { favorite });
}

export async function setTags(db: PixelToolboxDatabase, id: string, tags: string[]): Promise<void> {
  const cleaned = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await db.qrCodes.update(id, { tags: cleaned, updatedAt: Date.now() });
}

export async function duplicateQrCode(db: PixelToolboxDatabase, id: string): Promise<QrWithVersion> {
  return db.transaction("rw", db.qrCodes, db.versions, db.folders, async () => {
    const { code, version } = await getQrWithVersion(db, id);
    const siblings = await qrNamesIn(db, code.folderId);
    const created = await createQrCode(db, {
      name: uniqueName(code.name, siblings, "copy"),
      content: version.content,
      style: pickStyle(version),
      folderId: code.folderId,
    });
    if (code.tags.length) await db.qrCodes.update(created.code.id, { tags: [...code.tags] });
    return created;
  });
}

export async function deleteQrCodes(db: PixelToolboxDatabase, ids: string[]): Promise<void> {
  await db.transaction("rw", db.qrCodes, db.versions, async () => {
    await db.versions.where("qrCodeId").anyOf(ids).delete();
    await db.qrCodes.bulkDelete(ids);
  });
}

export async function moveQrCodes(db: PixelToolboxDatabase, ids: string[], folderId: string | null): Promise<void> {
  await db.transaction("rw", db.qrCodes, db.folders, async () => {
    await assertFolderExists(db, folderId);
    const now = Date.now();
    await db.qrCodes.where("id").anyOf(ids).modify({ folderId, updatedAt: now });
  });
}

async function qrNamesIn(db: PixelToolboxDatabase, folderId: string | null): Promise<string[]> {
  const codes = folderId
    ? await db.qrCodes.where("folderId").equals(folderId).toArray()
    : await db.qrCodes.filter((code) => code.folderId === null).toArray();
  return codes.map((code) => code.name);
}

// ---------------------------------------------------------------- folders

async function childFolders(db: PixelToolboxDatabase, parentId: string | null): Promise<FolderRecord[]> {
  return parentId
    ? db.folders.where("parentId").equals(parentId).toArray()
    : db.folders.filter((folder) => folder.parentId === null).toArray();
}

function cleanFolderName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) throw new AppError("INVALID_SETTINGS", "Enter a folder name.", { field: "name" });
  if (cleaned.length > MAX_FOLDER_NAME) {
    throw new AppError("INVALID_SETTINGS", `Folder names can be up to ${MAX_FOLDER_NAME} characters.`, { field: "name" });
  }
  return cleaned;
}

async function assertUniqueSiblingName(db: PixelToolboxDatabase, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await childFolders(db, parentId);
  if (siblings.some((folder) => folder.id !== exceptId && folder.name.toLowerCase() === name.toLowerCase())) {
    throw new AppError("CONFLICT", `A folder named “${name}” already exists here.`, { field: "name" });
  }
}

export async function createFolder(db: PixelToolboxDatabase, name: string, parentId: string | null): Promise<FolderRecord> {
  const cleaned = cleanFolderName(name);
  return db.transaction("rw", db.folders, async () => {
    await assertFolderExists(db, parentId);
    await assertUniqueSiblingName(db, parentId, cleaned);
    const now = Date.now();
    const folder: FolderRecord = { id: newId(), name: cleaned, parentId, createdAt: now, updatedAt: now };
    await db.folders.add(folder);
    return folder;
  });
}

export async function renameFolder(db: PixelToolboxDatabase, id: string, name: string): Promise<void> {
  const cleaned = cleanFolderName(name);
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(id);
    if (!folder) throw new AppError("NOT_FOUND", "This folder no longer exists.");
    await assertUniqueSiblingName(db, folder.parentId, cleaned, id);
    await db.folders.update(id, { name: cleaned, updatedAt: Date.now() });
  });
}

/** All descendant folder ids (not including `id`). */
export async function descendantFolderIds(db: PixelToolboxDatabase, id: string): Promise<string[]> {
  const all = await db.folders.toArray();
  return collectDescendants(all, id);
}

export function collectDescendants(folders: Pick<FolderRecord, "id" | "parentId">[], id: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder.id);
    byParent.set(folder.parentId, list);
  }
  const result: string[] = [];
  const stack = [...(byParent.get(id) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const next = stack.pop() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    stack.push(...(byParent.get(next) ?? []));
  }
  return result;
}

export async function moveFolder(db: PixelToolboxDatabase, id: string, newParentId: string | null): Promise<void> {
  await db.transaction("rw", db.folders, async () => {
    const folder = await db.folders.get(id);
    if (!folder) throw new AppError("NOT_FOUND", "This folder no longer exists.");
    if (newParentId === id) throw new AppError("CONFLICT", "A folder cannot be moved into itself.");
    if (newParentId) {
      await assertFolderExists(db, newParentId);
      const descendants = await descendantFolderIds(db, id);
      if (descendants.includes(newParentId)) {
        throw new AppError("CONFLICT", "A folder cannot be moved into one of its own subfolders.");
      }
    }
    if (folder.parentId === newParentId) return;
    await assertUniqueSiblingName(db, newParentId, folder.name, id);
    await db.folders.update(id, { parentId: newParentId, updatedAt: Date.now() });
  });
}

export type FolderDeletePolicy = "move-to-parent" | "delete-all";

export async function deleteFolder(db: PixelToolboxDatabase, id: string, policy: FolderDeletePolicy): Promise<void> {
  await db.transaction("rw", db.folders, db.qrCodes, db.versions, async () => {
    const folder = await db.folders.get(id);
    if (!folder) return;
    if (policy === "delete-all") {
      const folderIds = [id, ...(await descendantFolderIds(db, id))];
      const codeIds = (await db.qrCodes.where("folderId").anyOf(folderIds).primaryKeys()) as string[];
      await db.versions.where("qrCodeId").anyOf(codeIds).delete();
      await db.qrCodes.bulkDelete(codeIds);
      await db.folders.bulkDelete(folderIds);
      return;
    }
    const now = Date.now();
    // Move child folders up, renaming any that would clash with the parent's existing children.
    const parentChildren = (await childFolders(db, folder.parentId)).filter((child) => child.id !== id);
    const taken = parentChildren.map((child) => child.name);
    for (const child of await childFolders(db, id)) {
      const name = uniqueName(child.name, taken);
      taken.push(name);
      await db.folders.update(child.id, { parentId: folder.parentId, name, updatedAt: now });
    }
    await db.qrCodes.where("folderId").equals(id).modify({ folderId: folder.parentId, updatedAt: now });
    await db.folders.delete(id);
  });
}

/** Ancestor chain from root to `id` (inclusive). Stops on cycles or missing parents. */
export function folderPath(folders: FolderRecord[], id: string | null): FolderRecord[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: FolderRecord[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
