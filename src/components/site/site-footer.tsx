import Link from "next/link";
import { cacheLife } from "next/cache";
import { Globe, Heart } from "lucide-react";
import { author, siteConfig, tools } from "@/config/site";
import { LogoMark } from "@/components/site/logo";
import { GitHubIcon, LinkedInIcon } from "@/components/site/social-icons";

/** Current year, refreshed daily while the page itself stays prerendered. */
async function CurrentYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getFullYear()}</>;
}

const socialLinks = [
  { href: author.links.linkedin, label: "LinkedIn", icon: LinkedInIcon },
  { href: author.links.github, label: "GitHub", icon: GitHubIcon },
  { href: author.links.portfolio, label: "Portfolio", icon: Globe },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 font-semibold">
            <LogoMark className="size-7" />
            {siteConfig.name}
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Free QR code generator, video to GIF converter and image compressor. No sign-up — supported operations run
            locally in your browser.
          </p>
          <ul className="flex items-center gap-2" aria-label="Social links">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer me"
                  aria-label={`${author.name} on ${label}`}
                  title={label}
                  className="grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:border-primary/40 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icon className="size-4.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Tools" className="space-y-3">
          <h2 className="text-sm font-semibold">Tools</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {tools.map((tool) => (
              <li key={tool.href}>
                <Link href={tool.href} className="hover:text-foreground">
                  {tool.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Information" className="space-y-3">
          <h2 className="text-sm font-semibold">Information</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/privacy" className="hover:text-foreground">
                Privacy &amp; local processing
              </Link>
            </li>
            <li>
              <Link href="/#faq" className="hover:text-foreground">
                FAQ
              </Link>
            </li>
            <li>
              <a href={author.links.portfolio} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                About the developer
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-4 py-5 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p>
            Copyright © <CurrentYear /> {siteConfig.name}. All rights reserved.
          </p>
          <p className="inline-flex flex-wrap items-center justify-center gap-1.5">
            Made with
            <Heart className="size-4 fill-tool-video text-tool-video" aria-label="love" />
            by
            <a
              href={author.links.portfolio}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground hover:text-primary"
            >
              {author.shortName}
            </a>
            <span aria-hidden>·</span>
            <a
              href={author.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <GitHubIcon className="size-3.5" />@{author.githubUsername}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
