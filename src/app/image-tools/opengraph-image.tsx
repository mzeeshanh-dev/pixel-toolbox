import { ogSize, renderOgImage } from "@/components/seo/og-image";

export const alt = "Image Converter & Compressor — Pixel Toolbox";
export const size = ogSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage({
    eyebrow: "Image Tools",
    title: "Image Converter & Compressor",
    subtitle: "Convert JPG, PNG, WebP, AVIF and TIFF and compress to an exact target size.",
    accent: "#2dd4bf",
    chips: ["JPG · PNG · WebP", "AVIF · TIFF", "Compress to KB", "Free"],
  });
}
