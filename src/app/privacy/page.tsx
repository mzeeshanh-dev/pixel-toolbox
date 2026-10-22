import type { Metadata } from "next";
import { Cloud, Database, HardDrive, ShieldCheck } from "lucide-react";
import { imageLimits } from "@/config/limits";
import { formatBytes } from "@/lib/format";

export const metadata: Metadata = {
  title: "Privacy & local processing",
  description: "Which Pixel Toolbox operations run in your browser, what touches the server, and what is stored on your device.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy & local processing", url: "/privacy" },
};

const sections = [
  {
    icon: ShieldCheck,
    title: "Processed only in your browser",
    items: [
      "QR code generation, previews and exports.",
      "Video to GIF conversion, using FFmpeg compiled to WebAssembly and served from this site.",
      "Image conversion and compression to JPEG, PNG and WebP for formats your browser can decode.",
    ],
  },
  {
    icon: Cloud,
    title: "Processed on the server, only when needed",
    items: [
      `AVIF and TIFF output, TIFF input, animated images and advanced encoder options use a server function powered by Sharp. Files must be ${formatBytes(imageLimits.maxServerInputBytes, 0)} or smaller.`,
      "The page shows a “Server” badge before you start such a job.",
      "Uploaded images are processed in memory, returned to you, and never written to disk, logged or cached. Responses are marked no-store.",
    ],
  },
  {
    icon: Database,
    title: "Stored on this device",
    items: [
      "Your QR library (folders, codes and version history) lives in your browser's IndexedDB storage.",
      "Recent media jobs keep only metadata — file name, sizes, settings and status — never the files. Up to 50 entries are kept and you can clear them at any time.",
      "Your theme choice is kept in local storage.",
    ],
  },
  {
    icon: HardDrive,
    title: "Keeping your data safe",
    items: [
      "Browser storage can be erased when you clear site data, use private browsing, or switch devices or browsers.",
      "Use Export backup in the QR library to save a JSON copy you can import later.",
      "There are no accounts, advertising trackers or third-party processing services.",
      "Anonymous, cookieless page-view statistics are collected with Vercel Web Analytics. They never include your files, QR content or settings.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold sm:text-4xl">Privacy &amp; local processing</h1>
      <p className="mt-4 text-muted-foreground">
        Pixel Toolbox is designed so your files stay with you. Here is exactly where each operation runs and what is
        kept.
      </p>
      <div className="mt-10 space-y-5">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
            <h2 className="flex items-center gap-3 text-lg font-semibold">
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary">
                <section.icon className="size-4" aria-hidden />
              </span>
              {section.title}
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground marker:text-border">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
