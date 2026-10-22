import { Cloud, Laptop, Lock } from "lucide-react";
import type { EngineDecision } from "../lib/engine";

/** Tells the user where processing will happen before they start it. */
export function EngineBadge({ decision }: { decision: EngineDecision | null }) {
  if (!decision || decision.kind !== "ready") return null;
  if (decision.engine === "browser") {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-success/25 bg-success-soft px-3 py-2.5 text-xs">
        <Laptop className="mt-px size-4 shrink-0 text-success" aria-hidden />
        <span>
          <strong className="font-semibold">Processed in your browser.</strong>{" "}
          <span className="text-muted-foreground">The image never leaves this device.</span>
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 text-xs">
      <Cloud className="mt-px size-4 shrink-0 text-primary" aria-hidden />
      <span>
        <strong className="font-semibold">Uploaded to the server for {decision.reasons.join(", ")}.</strong>{" "}
        <span className="text-muted-foreground">
          <Lock className="mr-0.5 inline size-3 align-[-1px]" aria-hidden />
          Processed in memory and never stored.
        </span>
      </span>
    </p>
  );
}
