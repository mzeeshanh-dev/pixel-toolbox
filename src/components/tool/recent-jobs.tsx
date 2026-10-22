"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { History, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/tool/panel";
import { getDb, type JobRecord, type JobStatus, type JobTool } from "@/lib/db";
import { formatBytes, formatDateTime } from "@/lib/format";
import { clearJobs } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const statusLabels: Record<JobStatus, { label: string; className: string }> = {
  success: { label: "Done", className: "bg-success-soft text-success" },
  "target-missed": { label: "Target missed", className: "bg-warning-soft text-warning" },
  failed: { label: "Failed", className: "bg-destructive-soft text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

/** Lightweight local history of processing jobs (metadata only, no file contents). */
export function RecentJobs({ tools, className }: { tools: JobTool[]; className?: string }) {
  const [storageError, setStorageError] = useState(false);
  const jobs = useLiveQuery(async () => {
    try {
      return await getDb().jobs.where("tool").anyOf(tools).reverse().sortBy("createdAt");
    } catch {
      setStorageError(true);
      return [] as JobRecord[];
    }
  }, [tools.join(",")]);

  const recent = (jobs ?? []).slice(0, 8);

  return (
    <Panel
      className={className}
      title={
        <span className="inline-flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden /> Recent jobs
        </span>
      }
      description="Settings and sizes only — files are never stored."
      actions={
        recent.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void clearJobs(tools)}>
            <Trash2 aria-hidden /> Clear
          </Button>
        )
      }
    >
      {storageError ? (
        <p className="text-sm text-muted-foreground">Browser storage is unavailable, so history is not recorded.</p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">Finished jobs will appear here on this device.</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((job) => {
            const status = statusLabels[job.status];
            return (
              <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={job.fileName}>
                    {job.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {formatBytes(job.sourceBytes)}
                    {job.outputBytes !== null && ` → ${formatBytes(job.outputBytes)}`}
                    {" · "}
                    {Object.entries(job.settings)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <time className="text-xs text-muted-foreground" dateTime={new Date(job.createdAt).toISOString()}>
                    {formatDateTime(job.createdAt)}
                  </time>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                    {status.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
