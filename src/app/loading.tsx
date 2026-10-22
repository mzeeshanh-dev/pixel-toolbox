export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" role="status" aria-label="Loading">
      <div className="h-5 w-28 animate-pulse rounded-md bg-muted" />
      <div className="mt-6 flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-7 w-64 max-w-[60vw] animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-80 max-w-[70vw] animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[400px_1fr]">
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
