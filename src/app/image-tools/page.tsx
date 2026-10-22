import type { Metadata } from "next";
import { tools } from "@/config/site";
import { toolSchema, toolSeo } from "@/config/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ToolGuide } from "@/components/seo/tool-guide";
import { ToolPageHeader } from "@/components/tool/tool-page-header";
import { ImageTools } from "@/features/image/image-tools";

const tool = tools.find((item) => item.id === "image")!;
const seo = toolSeo.image;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: { canonical: "/image-tools" },
  openGraph: { title: seo.title, description: seo.description, url: "/image-tools", type: "website" },
  twitter: { card: "summary_large_image", title: seo.title, description: seo.description },
};

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd data={toolSchema(tool)} />
      <ToolPageHeader tool={tool} />
      <ImageTools />
      <ToolGuide tool={tool} />
    </div>
  );
}
