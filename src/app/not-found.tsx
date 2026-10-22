import Link from "next/link";
import { Compass } from "lucide-react";
import { tools } from "@/config/site";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-accent text-primary">
        <Compass className="size-6" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted-foreground">The page you are looking for does not exist. Try one of the tools instead.</p>
      <ul className="mt-8 flex flex-wrap justify-center gap-2">
        {tools.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="inline-flex h-10 items-center rounded-lg border border-input bg-card px-4 text-sm font-medium hover:bg-accent"
            >
              {tool.shortTitle}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="mt-6 text-sm font-medium text-primary hover:underline">
        Back to home
      </Link>
    </div>
  );
}
