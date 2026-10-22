import { ogSize, renderOgImage } from "@/components/seo/og-image";

export const alt = "Free QR Code Generator — Pixel Toolbox";
export const size = ogSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage({
    eyebrow: "QR Code Generator",
    title: "Free QR Code Generator",
    subtitle: "Custom colours, transparent PNG & SVG, bulk export and version history.",
    accent: "#a5a8ff",
    chips: ["Custom colours", "Transparent PNG", "SVG", "No sign-up"],
  });
}
