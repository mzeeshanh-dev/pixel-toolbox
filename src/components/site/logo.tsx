import { cn } from "@/lib/utils";

/** Pixel Toolbox mark: a 2×2 pixel grid with one accent pixel. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand text-brand-foreground shadow-soft",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
        <rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".55" />
        <rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".55" />
        <rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".9" />
      </svg>
    </span>
  );
}
