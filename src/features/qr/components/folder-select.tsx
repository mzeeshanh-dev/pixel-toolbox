"use client";

import { Folder, Home } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useField } from "@/components/tool/field";
import { flattenFolders, fromSelectValue, ROOT_VALUE, toSelectValue, useFolders } from "../hooks";

export function FolderSelect({
  value,
  onChange,
  disabledIds,
  label = "Folder",
}: {
  value: string | null;
  onChange: (folderId: string | null) => void;
  disabledIds?: Set<string>;
  label?: string;
}) {
  const field = useField();
  const folders = useFolders();
  const options = flattenFolders(folders?.data ?? []);
  const known = value === null || options.some((option) => option.id === value);
  return (
    <Select value={known ? toSelectValue(value) : ROOT_VALUE} onValueChange={(next) => onChange(fromSelectValue(next))}>
      <SelectTrigger {...field} aria-label={field.id ? undefined : label} className="h-10 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ROOT_VALUE}>
          <Home aria-hidden /> Library root
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id} disabled={disabledIds?.has(option.id)}>
            <span style={{ paddingLeft: option.depth * 12 }} className="inline-flex items-center gap-2">
              <Folder aria-hidden className="size-4 text-muted-foreground" />
              {option.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
