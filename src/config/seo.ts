import { imageLimits, videoLimits } from "@/config/limits";
import { author, siteConfig, type ToolDefinition, type ToolId } from "@/config/site";
import { formatBytes, formatDuration } from "@/lib/format";

export interface ToolSeo {
  /** <title> (the site name is appended by the layout template). */
  title: string;
  description: string;
  keywords: string[];
  /** Visible "how to" steps; also emitted as HowTo-style content on the page. */
  steps: { title: string; body: string }[];
  /** Visible FAQ; mirrored exactly in FAQPage structured data. */
  faqs: { q: string; a: string }[];
  applicationCategory: string;
  featureList: string[];
}

export const toolSeo: Record<ToolId, ToolSeo> = {
  qr: {
    title: "Free QR Code Generator – Custom Colours, PNG & SVG",
    description:
      "Free QR code generator with custom colours, transparent backgrounds, SVG and PNG download, bulk creation, folders and version history. No sign-up, no watermark, and your codes never leave your browser.",
    keywords: [
      "QR code generator",
      "free QR code generator",
      "QR code generator no sign up",
      "custom color QR code",
      "transparent QR code PNG",
      "QR code SVG",
      "bulk QR code generator",
      "QR code for URL",
      "QR code without watermark",
    ],
    steps: [
      { title: "Enter a link or text", body: "Paste a website URL or any text. Use Batch mode to create up to 100 codes at once." },
      { title: "Style it", body: "Pick foreground and background colours, a transparent background, margin and error correction level." },
      { title: "Download or save", body: "Download PNG or SVG, or save it to your local library with folders and version history." },
    ],
    faqs: [
      {
        q: "Is this QR code generator free?",
        a: "Yes. It is completely free, needs no account, and adds no watermark. Codes are static, so they never expire.",
      },
      {
        q: "Can I make a QR code with a transparent background?",
        a: "Yes. Turn on Transparent background and the downloaded PNG and SVG have real transparency, so they sit cleanly on any design.",
      },
      {
        q: "Which format should I download — PNG or SVG?",
        a: "Use SVG for print and design tools because it scales without losing sharpness. Use PNG for websites, documents and messaging apps.",
      },
      {
        q: "Will my QR code still scan with custom colours?",
        a: "Usually, as long as there is strong contrast. The generator warns you about low contrast and inverted colours, which some scanners struggle with.",
      },
      {
        q: "Where are my saved QR codes stored?",
        a: "In your browser on this device (IndexedDB). Export a JSON backup to move them to another device or keep a copy.",
      },
    ],
    applicationCategory: "UtilitiesApplication",
    featureList: [
      "Custom foreground and background colours",
      "Transparent PNG and SVG export",
      "Error correction levels L, M, Q and H",
      "Bulk QR code generation and ZIP download",
      "Folders, search and version history",
      "JSON backup and restore",
    ],
  },
  video: {
    title: "Video to GIF Converter – Free & High Quality",
    description: `Convert MP4, WebM and MOV videos to high-quality animated GIFs for free. Trim, set frame rate and width, and hit a target file size. Videos up to ${formatDuration(videoLimits.maxDurationSeconds)} are converted privately in your browser — nothing is uploaded.`,
    keywords: [
      "video to GIF converter",
      "MP4 to GIF",
      "convert video to GIF",
      "WebM to GIF",
      "MOV to GIF",
      "GIF maker",
      "high quality GIF",
      "compress GIF size",
      "video to GIF no upload",
    ],
    steps: [
      { title: "Choose a video", body: "Drop, paste (Ctrl+V) or browse for an MP4, WebM, MOV or other common video file." },
      { title: "Trim and tune", body: "Set start and end times, frame rate, width, quality and an optional target file size." },
      { title: "Convert and download", body: "The GIF is encoded with an optimised colour palette and you see its real size before downloading." },
    ],
    faqs: [
      {
        q: "Is my video uploaded to a server?",
        a: "No. Conversion runs entirely in your browser with FFmpeg compiled to WebAssembly, so your video stays on your device.",
      },
      {
        q: "How long can the video be?",
        a: `Source videos can be up to ${formatDuration(videoLimits.maxDurationSeconds)} and ${formatBytes(videoLimits.maxInputBytes, 0)}. Long GIFs take longer to encode and can be large, so trimming to the part you need gives the best result.`,
      },
      {
        q: "How do I make a GIF smaller?",
        a: "Set a target size. The converter measures each attempt and lowers frame rate first, then width, keeping quality as high as possible. Lower frame rates and widths make much smaller files.",
      },
      {
        q: "Why does a GIF look different from the video?",
        a: "GIF supports at most 256 colours per frame. Palette generation and dithering keep colours as faithful as the format allows, but gradients can never match the original exactly.",
      },
    ],
    applicationCategory: "MultimediaApplication",
    featureList: [
      "MP4, WebM, MOV and more to GIF",
      "Trim start and end",
      "Frame rate and width controls",
      "Palette-optimised encoding",
      "Target file size with measured retries",
      "Runs locally in the browser",
    ],
  },
  image: {
    title: "Image Converter & Compressor – JPG, PNG, WebP, AVIF",
    description:
      "Free online image converter and compressor. Convert between JPG, PNG, WebP, AVIF and TIFF, compress to a target size in KB or MB, and resize — with honest before/after sizes. Most conversions run in your browser.",
    keywords: [
      "image converter",
      "image compressor",
      "compress image online",
      "compress JPG to 100KB",
      "PNG to WebP",
      "JPG to WebP",
      "convert to AVIF",
      "PNG to JPG",
      "reduce image size",
      "TIFF converter",
    ],
    steps: [
      { title: "Add an image", body: "Drop, paste (Ctrl+V) or browse for a JPG, PNG, WebP, GIF, AVIF, TIFF or BMP image." },
      { title: "Convert or compress", body: "Pick an output format and quality, or set a target size in KB/MB with a compression mode." },
      { title: "Compare and download", body: "See the real output size, savings and dimensions next to the original, then download." },
    ],
    faqs: [
      {
        q: "How do I compress an image to a specific size like 100 KB?",
        a: "Open Compress, enter the target size, and choose Strict Size Target. The tool searches quality settings (and optionally resizes) and tells you honestly if the target cannot be reached.",
      },
      {
        q: "Which format makes the smallest images?",
        a: "AVIF and WebP are usually much smaller than JPG or PNG at similar quality. Use PNG or lossless WebP when you need pixel-perfect output or transparency.",
      },
      {
        q: "Are my images uploaded?",
        a: `JPG, PNG and WebP conversions run in your browser. AVIF, TIFF and some advanced options use a secure server function for files up to ${formatBytes(imageLimits.maxServerInputBytes, 0)}; images are processed in memory and never stored.`,
      },
      {
        q: "Does converting to JPG keep transparency?",
        a: "No — JPG has no transparency. The tool warns you and lets you choose a background colour, or keep transparency by choosing PNG, WebP or AVIF.",
      },
    ],
    applicationCategory: "MultimediaApplication",
    featureList: [
      "Convert JPG, PNG, WebP, AVIF and TIFF",
      "Compress to a target size in KB or MB",
      "Quality presets and lossless mode",
      "Resize with aspect ratio",
      "Before and after size comparison",
    ],
  },
};

export function absoluteUrl(path = "/"): string {
  return new URL(path, siteConfig.url).toString();
}

export const personSchema = {
  "@type": "Person",
  "@id": absoluteUrl("/#author"),
  name: author.name,
  alternateName: author.githubUsername,
  url: author.links.portfolio,
  sameAs: [author.links.linkedin, author.links.github, author.links.portfolio],
};

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        url: absoluteUrl("/"),
        name: siteConfig.name,
        description: siteConfig.description,
        inLanguage: "en",
        author: { "@id": absoluteUrl("/#author") },
        publisher: { "@id": absoluteUrl("/#author") },
      },
      personSchema,
    ],
  };
}

export function toolSchema(tool: ToolDefinition) {
  const seo = toolSeo[tool.id];
  const url = absoluteUrl(tool.href);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: tool.title,
        url,
        description: seo.description,
        applicationCategory: seo.applicationCategory,
        operatingSystem: "Any (web browser)",
        browserRequirements: "Requires JavaScript and a modern browser.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: seo.featureList,
        author: { "@id": absoluteUrl("/#author") },
        isPartOf: { "@id": absoluteUrl("/#website") },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: tool.title, item: url },
        ],
      },
      faqSchema(seo.faqs),
    ],
  };
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}
