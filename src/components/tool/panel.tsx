import { cn } from "@/lib/utils";

/** Bordered surface used for settings and preview areas on every tool page. */
export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
  as: Component = "section",
  ...props
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
  as?: "section" | "div" | "aside";
} & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <Component
      className={cn("min-w-0 rounded-2xl border border-border bg-card text-card-foreground shadow-soft", className)}
      {...props}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </Component>
  );
}

/** Two-column work area: settings on the left, preview/results on the right; stacks on mobile. */
export function ToolWorkspace({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid items-start gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
