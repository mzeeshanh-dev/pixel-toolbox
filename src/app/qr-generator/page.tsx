import type { Metadata } from "next";
import { tools } from "@/config/site";
import { toolSchema, toolSeo } from "@/config/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { ToolGuide } from "@/components/seo/tool-guide";
import { ToolPageHeader } from "@/components/tool/tool-page-header";
import { QrGenerator } from "@/features/qr/qr-generator";

const tool = tools.find((item) => item.id === "qr")!;
const seo = toolSeo.qr;

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  alternates: { canonical: "/qr-generator" },
  openGraph: { title: seo.title, description: seo.description, url: "/qr-generator", type: "website" },
  twitter: { card: "summary_large_image", title: seo.title, description: seo.description },
};

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <JsonLd data={toolSchema(tool)} />
      <ToolPageHeader tool={tool} />
      <QrGenerator />
      <ToolGuide tool={tool} />
    </div>
  );
}
