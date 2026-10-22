"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/15",
        className
      )}
      value={value}
      {...props}
    >
      {value === undefined || value === null ? (
        // Indeterminate: the engine cannot report progress, so show motion without a fake percentage.
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="animate-progress-indeterminate h-full w-2/5 rounded-full bg-primary"
        />
      ) : (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-full flex-1 bg-primary transition-all"
          style={{ transform: `translateX(-${100 - value}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  )
}

export { Progress }
