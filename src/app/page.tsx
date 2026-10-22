import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Download, MousePointerClick, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { imageLimits, videoLimits } from "@/config/limits";
import { tools } from "@/config/site";
import { ToolIcon } from "@/components/site/tool-icon";
import { absoluteUrl, faqSchema } from "@/config/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { formatBytes, formatDuration } from "@/lib/format";

const steps = [
  {
    icon: MousePointerClick,
    title: "Pick a tool",
    body: "Choose QR codes, video to GIF, or image conversion. No account or sign-up.",
  },
  {
    icon: SlidersHorizontal,
    title: "Adjust the settings",
    body: "Set colours, frame rate, format, quality or a target size, with live validation.",
  },
  {
    icon: Download,
    title: "Download the result",
    body: "See the real output size and dimensions before you save the file.",
  },
];

const faqs = [
  {
    q: "Are my files uploaded?",
    a: `QR codes and video-to-GIF conversion run entirely in your browser. Image conversion runs in the browser for JPEG, PNG and WebP. AVIF, TIFF, animated images and advanced options use a secure server function for files up to ${formatBytes(imageLimits.maxServerInputBytes, 0)}; the file is processed in memory and never stored.`,
  },
  {
    q: "What are the file limits?",
    a: `Videos can be up to ${formatBytes(videoLimits.maxInputBytes, 0)} and ${formatDuration(videoLimits.maxDurationSeconds)} long. Images can be up to ${formatBytes(imageLimits.maxBrowserInputBytes, 0)} in the browser and ${formatBytes(imageLimits.maxServerInputBytes, 0)} when server processing is needed.`,
  },
  {
    q: "Can a GIF be both tiny and high quality?",
    a: "Not always. GIF is limited to 256 colours per frame, so the converter measures each attempt and lowers frame rate and size gradually. If a target cannot be reached without heavy quality loss, it tells you instead of pretending.",
  },
  {
    q: "Where are my saved QR codes kept?",
    a: "In your browser's IndexedDB storage on this device. Clearing site data or switching devices removes them, so export a JSON backup from the QR library to keep a copy.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "ItemList",
              name: "Pixel Toolbox tools",
              itemListElement: tools.map((tool, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: tool.title,
                url: absoluteUrl(tool.href),
              })),
            },
            faqSchema(faqs),
          ],
        }}
      />
      <section aria-labelledby="hero-title" className="pt-12 pb-10 sm:pt-20 sm:pb-14">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-soft">
          <ShieldCheck className="size-3.5 text-success" aria-hidden />
          Supported operations run locally in your browser
        </p>
        <h1 id="hero-title" className="max-w-3xl text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
          Your everyday tools.{" "}
          <span className="text-muted-foreground">One simple workspace.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          A free <strong className="font-semibold text-foreground">QR code generator</strong>,{" "}
          <strong className="font-semibold text-foreground">video to GIF converter</strong> and{" "}
          <strong className="font-semibold text-foreground">image converter &amp; compressor</strong> — all in one
          place. No sign-up, no watermarks.
        </p>
      </section>

      <section aria-labelledby="tools-title" className="pb-16 sm:pb-20">
        <h2 id="tools-title" className="sr-only">
          Tools
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.id} className="flex">
              <Link
                href={tool.href}
                className="group relative flex w-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:p-6"
              >
                <ToolIcon tool={tool.id} size="lg" />
                <h3 className="mt-5 text-lg font-semibold">{tool.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{tool.description}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {tool.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-6 inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-primary">
                  Open {tool.shortTitle}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-title" className="border-t border-border py-14 sm:py-16">
        <h2 id="how-title" className="text-2xl font-semibold">
          How it works
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-sm font-semibold tabular shadow-soft">
                {index + 1}
              </span>
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  <step.icon className="size-4 text-muted-foreground" aria-hidden />
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="privacy-title"
        className="mb-14 grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-soft sm:mb-16 sm:p-8 md:grid-cols-[1fr_auto] md:items-center"
      >
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="privacy-title" className="text-lg font-semibold">
              Private by default
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Videos and QR codes never leave your device. Images are processed in the browser whenever it can do
              the job; when a format needs the server, the page tells you before uploading and nothing is stored.
            </p>
          </div>
        </div>
        <Link
          href="/privacy"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Privacy details <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 pb-16 sm:pb-20">
        <h2 id="faq-title" className="text-2xl font-semibold">
          Frequently asked questions
        </h2>
        <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card shadow-soft">
          {faqs.map((faq) => (
            <details key={faq.q} className="group px-5 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {faq.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-4 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
