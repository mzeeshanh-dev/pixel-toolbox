function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  // Provided automatically by Vercel at build time.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const author = {
  name: "Muhammad Zeeshan Haider",
  shortName: "Zeeshan",
  githubUsername: "mzeeshanh-dev",
  links: {
    linkedin: "https://www.linkedin.com/in/m-zeeshan-haider-606bb3284/",
    github: "https://github.com/mzeeshanh-dev/",
    portfolio: "https://m-zeeshan-haider.vercel.app/",
  },
} as const;

export const siteConfig = {
  name: "Pixel Toolbox",
  description:
    "Free online QR code generator, video to GIF converter and image converter & compressor. Fast, private, no sign-up — files are processed in your browser.",
  shortDescription:
    "Create QR codes, convert videos into GIFs, and compress or convert images — all in one place.",
  url: resolveSiteUrl(),
  keywords: [
    "QR code generator",
    "free QR code generator",
    "custom QR code with colors",
    "transparent QR code",
    "bulk QR code generator",
    "QR code SVG download",
    "video to GIF converter",
    "MP4 to GIF",
    "convert video to GIF online",
    "GIF maker",
    "image converter",
    "image compressor",
    "compress image to 100KB",
    "PNG to WebP",
    "JPG to AVIF",
    "online image tools",
    "Pixel Toolbox",
  ],
} as const;

export type ToolId = "qr" | "video" | "image";

export interface ToolDefinition {
  id: ToolId;
  href: "/qr-generator" | "/video-to-gif" | "/image-tools";
  title: string;
  shortTitle: string;
  description: string;
  features: readonly string[];
  processing: "local" | "local-and-server";
}

export const tools: readonly ToolDefinition[] = [
  {
    id: "qr",
    href: "/qr-generator",
    title: "QR Code Generator",
    shortTitle: "QR Generator",
    description: "Design QR codes and keep them organised in a local library.",
    features: [
      "Custom colours and transparent backgrounds",
      "Folders, search and batch ZIP export",
      "Version history with restore",
    ],
    processing: "local",
  },
  {
    id: "video",
    href: "/video-to-gif",
    title: "Video to GIF",
    shortTitle: "Video to GIF",
    description: "Turn short clips into palette-optimised animated GIFs.",
    features: [
      "Trim, frame rate and width controls",
      "Target file size with measured retries",
      "Converted entirely in your browser",
    ],
    processing: "local",
  },
  {
    id: "image",
    href: "/image-tools",
    title: "Image Converter & Compressor",
    shortTitle: "Image Tools",
    description: "Convert formats and shrink file sizes with real measurements.",
    features: [
      "JPEG, PNG, WebP, AVIF and TIFF output",
      "Quality presets and target-size search",
      "Before / after size comparison",
    ],
    processing: "local-and-server",
  },
] as const;
