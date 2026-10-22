"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDb, type FolderRecord, type PixelToolboxDatabase } from "@/lib/db";
import { toUserError, type UserError } from "@/lib/errors";

export function useDebouncedValue<T>(value: T, delay = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type LiveResult<T> = { data: T; error: null } | { data: null; error: UserError };

/**
 * useLiveQuery wrapper that never throws into React: storage failures (blocked
 * IndexedDB, private mode) come back as a user-facing error instead.
 */
export function useLibraryQuery<T>(
  query: (db: PixelToolboxDatabase) => Promise<T>,
  deps: unknown[],
): LiveResult<T> | undefined {
  return useLiveQuery<LiveResult<T>>(async () => {
    try {
      return { data: await query(getDb()), error: null };
    } catch (error) {
      return { data: null, error: toUserError(error) };
    }
  }, deps);
}

export function useFolders() {
  return useLibraryQuery((db) => db.folders.toArray(), []);
}

export interface FolderOption {
  id: string;
  label: string;
  depth: number;
  name: string;
}

/** Depth-first, name-sorted flattening of the folder tree for selects and the sidebar. */
export function flattenFolders(folders: FolderRecord[]): FolderOption[] {
  const byParent = new Map<string | null, FolderRecord[]>();
  for (const folder of folders) {
    const key = folder.parentId && folders.some((f) => f.id === folder.parentId) ? folder.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(folder);
    byParent.set(key, list);
  }
  const result: FolderOption[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number, prefix: string) => {
    const children = (byParent.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      const label = prefix ? `${prefix} / ${child.name}` : child.name;
      result.push({ id: child.id, label, depth, name: child.name });
      walk(child.id, depth + 1, label);
    }
  };
  walk(null, 0, "");
  return result;
}

/** Radix Select cannot use "" as a value, so the library root uses a sentinel. */
export const ROOT_VALUE = "__root__";
export const toSelectValue = (folderId: string | null) => folderId ?? ROOT_VALUE;
export const fromSelectValue = (value: string) => (value === ROOT_VALUE ? null : value);
