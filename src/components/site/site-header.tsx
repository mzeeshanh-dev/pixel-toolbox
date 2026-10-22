"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import { tools, siteConfig } from "@/config/site";
import { LogoMark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme";
import { ToolIcon } from "@/components/site/tool-icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const links = [
  ...tools.map((tool) => ({ href: tool.href, label: tool.shortTitle })),
  { href: "/privacy" as const, label: "Privacy" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LogoMark />
          <span>{siteConfig.name}</span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  active && "bg-accent text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,88vw)] gap-0 p-0">
              <SheetHeader className="border-b border-border p-4">
                <SheetTitle className="flex items-center gap-2.5">
                  <LogoMark className="size-7" /> {siteConfig.name}
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 p-3">
                {tools.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === tool.href ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl p-2.5 text-sm font-medium hover:bg-accent",
                      pathname === tool.href && "bg-accent",
                    )}
                  >
                    <ToolIcon tool={tool.id} size="sm" />
                    {tool.title}
                  </Link>
                ))}
                <Link
                  href="/privacy"
                  onClick={() => setOpen(false)}
                  aria-current={pathname === "/privacy" ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl p-2.5 text-sm font-medium hover:bg-accent",
                    pathname === "/privacy" && "bg-accent",
                  )}
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-success-soft text-success">
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>
                  Privacy
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
