import Link from "next/link";
import { ChevronLeft, Cloud, ShieldCheck } from "lucide-react";
import type { ToolDefinition } from "@/config/site";
import { ToolIcon } from "@/components/site/tool-icon";

export function ToolPageHeader({ tool, children }: { tool: ToolDefinition; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5 pb-6 sm:pb-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-md py-1 pr-1 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeft className="size-4" aria-hidden />
              All tools
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-medium text-foreground">
            {tool.shortTitle}
          </li>
        </ol>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <ToolIcon tool={tool.id} size="lg" />
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold sm:text-3xl">{tool.title}</h1>
            <p className="max-w-2xl text-muted-foreground">{tool.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            {tool.processing === "local" ? "Runs in your browser" : "Local first"}
          </span>
          {tool.processing === "local-and-server" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium">
              <Cloud className="size-3.5 text-muted-foreground" aria-hidden />
              Server only when required
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
