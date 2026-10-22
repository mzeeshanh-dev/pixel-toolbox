import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PixelToolboxDatabase } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  applyImport,
  analyzeImport,
  exportBackup,
  parseBackup,
  type QrBackup,
} from "@/features/qr/lib/backup";
import {
  createFolder,
  createQrCode,
  deleteFolder,
  deleteQrCodes,
  duplicateQrCode,
  getQrWithVersion,
  listVersions,
  moveFolder,
  moveQrCodes,
  renameFolder,
  renameQrCode,
  restoreVersion,
  saveQrVersion,
} from "@/features/qr/lib/repository";
import { defaultStyle } from "@/features/qr/lib/validation";

let db: PixelToolboxDatabase;
let dbName: string;

beforeEach(async () => {
  dbName = `test-${crypto.randomUUID()}`;
  db = new PixelToolboxDatabase(dbName);
  await db.open();
});

afterEach(async () => {
  db.close();
  await PixelToolboxDatabase.delete(dbName);
});

const draft = (name = "Menu", content = "https://example.com/menu", folderId: string | null = null) => ({
  name,
  content,
  style: { ...defaultStyle },
  folderId,
});

describe("QR codes and versions", () => {
  it("creates a code with version 1 and persists across a reload", async () => {
    const { code, version } = await createQrCode(db, draft());
    expect(version.versionNumber).toBe(1);
    expect(code.currentVersionId).toBe(version.id);

    db.close();
    const reopened = new PixelToolboxDatabase(dbName);
    const loaded = await getQrWithVersion(reopened, code.id);
    expect(loaded.code.name).toBe("Menu");
    expect(loaded.version.content).toBe("https://example.com/menu");
    reopened.close();
    db = new PixelToolboxDatabase(dbName);
  });

  it("only creates a version when content or style really changes", async () => {
    const { code } = await createQrCode(db, draft());
    const noop = await saveQrVersion(db, code.id, {
      content: "https://example.com/menu",
      style: { ...defaultStyle, foregroundColor: defaultStyle.foregroundColor.toUpperCase() },
    });
    expect(noop.status).toBe("unchanged");
    await renameQrCode(db, code.id, "Renamed");
    expect(await listVersions(db, code.id)).toHaveLength(1);

    const changed = await saveQrVersion(db, code.id, { content: "https://example.com/v2", style: defaultStyle });
    expect(changed.status).toBe("created");
    expect(changed.version.versionNumber).toBe(2);
    const styled = await saveQrVersion(db, code.id, {
      content: "https://example.com/v2",
      style: { ...defaultStyle, foregroundColor: "#ff0000" },
    });
    expect(styled.version.versionNumber).toBe(3);
    const current = await getQrWithVersion(db, code.id);
    expect(current.code.content).toBe("https://example.com/v2");
    expect(current.version.foregroundColor).toBe("#ff0000");
  });

  it("restoring creates a new version and keeps the full history", async () => {
    const { code, version: v1 } = await createQrCode(db, draft());
    await saveQrVersion(db, code.id, { content: "changed", style: { ...defaultStyle, margin: 2 } });
    const restored = await restoreVersion(db, code.id, v1.id);
    expect(restored.status).toBe("created");
    expect(restored.version.versionNumber).toBe(3);
    expect(restored.version.restoredFromVersion).toBe(1);
    expect(restored.version.content).toBe(v1.content);
    expect(restored.version.margin).toBe(v1.margin);
    const history = await listVersions(db, code.id);
    expect(history.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
  });

  it("duplicates with a copy suffix and deletes codes with their versions", async () => {
    const { code } = await createQrCode(db, draft());
    const first = await duplicateQrCode(db, code.id);
    const second = await duplicateQrCode(db, code.id);
    expect(first.code.name).toBe("Menu (copy)");
    expect(second.code.name).toBe("Menu (copy 2)");
    expect(first.version.versionNumber).toBe(1);

    await deleteQrCodes(db, [code.id]);
    expect(await db.qrCodes.get(code.id)).toBeUndefined();
    expect(await db.versions.where("qrCodeId").equals(code.id).count()).toBe(0);
    expect(await db.qrCodes.count()).toBe(2);
  });

  it("rejects empty content and invalid styles", async () => {
    await expect(createQrCode(db, { ...draft(), content: "  " })).rejects.toBeInstanceOf(AppError);
    await expect(createQrCode(db, { ...draft(), style: { ...defaultStyle, foregroundColor: "blue" } })).rejects.toThrow(
      /invalid/,
    );
  });
});

describe("folders", () => {
  it("creates nested folders and enforces unique sibling names", async () => {
    const parent = await createFolder(db, "Events", null);
    const child = await createFolder(db, "2026", parent.id);
    expect(child.parentId).toBe(parent.id);
    await expect(createFolder(db, "events", null)).rejects.toThrow(/already exists/);
    await expect(createFolder(db, "2026", null)).resolves.toBeDefined();
    await expect(renameFolder(db, child.id, "  ")).rejects.toThrow(/folder name/);
  });

  it("prevents moving a folder into itself or a descendant", async () => {
    const a = await createFolder(db, "A", null);
    const b = await createFolder(db, "B", a.id);
    const c = await createFolder(db, "C", b.id);
    await expect(moveFolder(db, a.id, a.id)).rejects.toThrow(/into itself/);
    await expect(moveFolder(db, a.id, c.id)).rejects.toThrow(/own subfolders/);
    await moveFolder(db, c.id, null);
    expect((await db.folders.get(c.id))?.parentId).toBeNull();
  });

  it("moves codes between folders", async () => {
    const folder = await createFolder(db, "Print", null);
    const { code } = await createQrCode(db, draft());
    await moveQrCodes(db, [code.id], folder.id);
    expect((await db.qrCodes.get(code.id))?.folderId).toBe(folder.id);
    await expect(moveQrCodes(db, [code.id], "missing")).rejects.toThrow(/no longer exists/);
  });

  it("deleting with move-to-parent keeps contents and renames clashing subfolders", async () => {
    const root = await createFolder(db, "Shared", null);
    const doomed = await createFolder(db, "Doomed", null);
    const inner = await createFolder(db, "Shared", doomed.id);
    const { code } = await createQrCode(db, draft("Inside", "x", doomed.id));
    await deleteFolder(db, doomed.id, "move-to-parent");
    expect(await db.folders.get(doomed.id)).toBeUndefined();
    const moved = await db.folders.get(inner.id);
    expect(moved?.parentId).toBeNull();
    expect(moved?.name).toBe("Shared (2)");
    expect((await db.qrCodes.get(code.id))?.folderId).toBeNull();
    expect(await db.folders.get(root.id)).toBeDefined();
  });

  it("deleting with delete-all removes nested folders, codes and versions", async () => {
    const top = await createFolder(db, "Top", null);
    const nested = await createFolder(db, "Nested", top.id);
    const { code } = await createQrCode(db, draft("Deep", "deep", nested.id));
    const keep = await createQrCode(db, draft("Keep", "keep"));
    await deleteFolder(db, top.id, "delete-all");
    expect(await db.folders.count()).toBe(0);
    expect(await db.qrCodes.get(code.id)).toBeUndefined();
    expect(await db.versions.where("qrCodeId").equals(code.id).count()).toBe(0);
    expect(await db.qrCodes.get(keep.code.id)).toBeDefined();
  });
});

describe("backup", () => {
  async function seed() {
    const folder = await createFolder(db, "Clients", null);
    const sub = await createFolder(db, "Acme", folder.id);
    const { code } = await createQrCode(db, draft("Acme site", "https://acme.test", sub.id));
    await saveQrVersion(db, code.id, { content: "https://acme.test/v2", style: defaultStyle });
    return { folder, sub, code };
  }

  it("round-trips export → import into an empty library", async () => {
    await seed();
    const text = JSON.stringify(await exportBackup(db));
    const backup = parseBackup(text);

    const otherName = `test-${crypto.randomUUID()}`;
    const other = new PixelToolboxDatabase(otherName);
    const analysis = await analyzeImport(other, backup);
    expect(analysis.hasConflicts).toBe(false);
    expect(analysis.counts).toEqual({ folders: 2, qrCodes: 1, versions: 2 });
    const result = await applyImport(other, backup, "merge");
    expect(result).toMatchObject({ folders: 2, qrCodes: 1, versions: 2, skipped: 0 });
    const [imported] = await other.qrCodes.toArray();
    expect((await getQrWithVersion(other, imported.id)).version.content).toBe("https://acme.test/v2");
    other.close();
    await PixelToolboxDatabase.delete(otherName);
  });

  it("detects conflicts; merge never overwrites, copies remap every id", async () => {
    const { code } = await seed();
    const backup = parseBackup(JSON.stringify(await exportBackup(db)));
    await renameQrCode(db, code.id, "Locally renamed");

    const analysis = await analyzeImport(db, backup);
    expect(analysis.conflicts).toEqual({ folders: 2, qrCodes: 1, versions: 2 });

    const merged = await applyImport(db, backup, "merge");
    expect(merged.qrCodes).toBe(0);
    expect(merged.skipped).toBe(5);
    expect((await db.qrCodes.get(code.id))?.name).toBe("Locally renamed");

    const copied = await applyImport(db, backup, "copies");
    expect(copied).toMatchObject({ folders: 2, qrCodes: 1, versions: 2 });
    expect(await db.qrCodes.count()).toBe(2);
    expect(await db.versions.count()).toBe(4);
    const rootFolders = await db.folders.filter((f) => f.parentId === null).toArray();
    expect(rootFolders.map((f) => f.name).sort()).toEqual(["Clients", "Clients (2)"]);
    const copy = (await db.qrCodes.toArray()).find((q) => q.id !== code.id)!;
    const { version } = await getQrWithVersion(db, copy.id);
    expect(version.qrCodeId).toBe(copy.id);
    expect(copy.folderId).not.toBe(code.folderId);
  });

  it("rejects invalid backups with clear messages and imports nothing", async () => {
    expect(() => parseBackup("{not json")).toThrow(/not valid JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/not a Pixel Toolbox/);
    expect(() =>
      parseBackup(JSON.stringify({ format: "pixel-toolbox-qr-backup", schemaVersion: 9 })),
    ).toThrow(/newer version/);

    await seed();
    const good = await exportBackup(db);
    const badColour: QrBackup = structuredClone(good);
    badColour.versions[0].foregroundColor = "purple";
    expect(() => parseBackup(JSON.stringify(badColour))).toThrow(/invalid data/);

    const orphan: QrBackup = structuredClone(good);
    orphan.qrCodes[0].currentVersionId = "missing";
    expect(() => parseBackup(JSON.stringify(orphan))).toThrow(/missing its current version/);

    const cycle: QrBackup = structuredClone(good);
    cycle.folders[0].parentId = cycle.folders[1].id;
    cycle.folders[1].parentId = cycle.folders[0].id;
    expect(() => parseBackup(JSON.stringify(cycle))).toThrow(/cycle/);
  });
});
