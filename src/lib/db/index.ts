import Dexie, { type EntityTable } from "dexie";

/**
 * IndexedDB schema (via Dexie). The QR library lives here as the source of truth;
 * media jobs only keep lightweight metadata — never file contents.
 *
 * `folderId` / `parentId` of `null` means "library root". IndexedDB does not index
 * null keys, so root-level queries filter instead of using an index.
 */

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface QrCodeRecord {
  id: string;
  name: string;
  /** Mirrors the current version's content for searching and sorting. */
  content: string;
  folderId: string | null;
  currentVersionId: string;
  favorite: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface QrStyle {
  foregroundColor: string;
  backgroundColor: string;
  transparentBackground: boolean;
  errorCorrectionLevel: ErrorCorrectionLevel;
  margin: number;
}

export interface QrVersionRecord extends QrStyle {
  id: string;
  qrCodeId: string;
  versionNumber: number;
  content: string;
  /** Set when this version was created by restoring an older one. */
  restoredFromVersion?: number;
  createdAt: number;
}

export type JobTool = "video-to-gif" | "image-convert" | "image-compress";
export type JobStatus = "success" | "target-missed" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  tool: JobTool;
  fileName: string;
  sourceBytes: number;
  outputBytes: number | null;
  /** Human-readable settings summary, e.g. { format: "webp", quality: 80 }. */
  settings: Record<string, string | number | boolean>;
  status: JobStatus;
  message?: string;
  createdAt: number;
}

export class PixelToolboxDatabase extends Dexie {
  folders!: EntityTable<FolderRecord, "id">;
  qrCodes!: EntityTable<QrCodeRecord, "id">;
  versions!: EntityTable<QrVersionRecord, "id">;
  jobs!: EntityTable<JobRecord, "id">;

  constructor(name = "pixel-toolbox") {
    super(name);
    this.version(1).stores({
      folders: "id, parentId, name, updatedAt",
      qrCodes: "id, folderId, name, updatedAt, createdAt, *tags",
      versions: "id, qrCodeId, [qrCodeId+versionNumber], createdAt",
      jobs: "id, tool, createdAt",
    });
    // Future schema changes: add this.version(2).stores({...}).upgrade(tx => ...) here.
  }
}

let instance: PixelToolboxDatabase | null = null;

/** Lazily opened singleton; only call from client code. */
export function getDb(): PixelToolboxDatabase {
  if (typeof indexedDB === "undefined") {
    throw Object.assign(new Error("IndexedDB unavailable"), { name: "MissingAPIError" });
  }
  instance ??= new PixelToolboxDatabase();
  return instance;
}

/** Test helper: replace the singleton (e.g. with a fresh fake-indexeddb database). */
export function setDbForTesting(db: PixelToolboxDatabase | null): void {
  instance = db;
}

export function newId(): string {
  return crypto.randomUUID();
}
