"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-destructive-soft text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        This page hit an unexpected problem. Your saved QR library is stored separately and is not affected.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
