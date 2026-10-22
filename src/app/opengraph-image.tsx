import { siteConfig } from "@/config/site";
import { ogSize, renderOgImage } from "@/components/seo/og-image";

export const alt = `${siteConfig.name} — free QR code generator, video to GIF converter and image compressor`;
export const size = ogSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderOgImage({
    title: "Your everyday tools. One simple workspace.",
    subtitle: "Free QR codes, video to GIF and image compression — private, fast, no sign-up.",
    chips: ["QR Generator", "Video to GIF", "Image Tools"],
  });
}
