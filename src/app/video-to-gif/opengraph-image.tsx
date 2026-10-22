import { ogSize, renderOgImage } from "@/components/seo/og-image";

export const alt = "Video to GIF Converter — Pixel Toolbox";
export const size = ogSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage({
    eyebrow: "Video to GIF",
    title: "Video to GIF Converter",
    subtitle: "High-quality GIFs from MP4, WebM and MOV — converted privately in your browser.",
    accent: "#fb7185",
    chips: ["MP4 to GIF", "Trim & resize", "Target size", "No upload"],
  });
}
