import { Film, ImageIcon, QrCode, type LucideIcon } from "lucide-react";
import type { ToolId } from "@/config/site";
import { cn } from "@/lib/utils";

export const toolIcons: Record<ToolId, LucideIcon> = {
  qr: QrCode,
  video: Film,
  image: ImageIcon,
};

const tints: Record<ToolId, string> = {
  qr: "bg-tool-qr-soft text-tool-qr",
  video: "bg-tool-video-soft text-tool-video",
  image: "bg-tool-image-soft text-tool-image",
};

export function ToolIcon({ tool, className, size = "md" }: { tool: ToolId; className?: string; size?: "sm" | "md" | "lg" }) {
  const Icon = toolIcons[tool];
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        size === "sm" && "size-8 rounded-lg [&>svg]:size-4",
        size === "md" && "size-10 [&>svg]:size-5",
        size === "lg" && "size-12 [&>svg]:size-6",
        tints[tool],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
