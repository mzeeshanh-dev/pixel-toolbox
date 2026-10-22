import type { Metadata } from "next";
import { tools } from "@/config/site";
import { toolSchema, toolSeo } from "@/config/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ToolGuide } from "@/components/seo/tool-guide";
import { ToolPageHeader } from "@/components/tool/tool-page-header";
import { VideoToGif } from "@/features/video/video-to-gif";

const tool = tools.find((item) => item.id === "video")!;
const seo = toolSeo.video;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: { canonical: "/video-to-gif" },
  openGraph: { title: seo.title, description: seo.description, url: "/video-to-gif", type: "website" },
  twitter: { card: "summary_large_image", title: seo.title, description: seo.description },
};

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd data={toolSchema(tool)} />
      <ToolPageHeader tool={tool} />
      <VideoToGif />
      <ToolGuide tool={tool} />
    </div>
  );
}
