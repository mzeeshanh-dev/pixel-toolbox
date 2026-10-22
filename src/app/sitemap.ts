import type { MetadataRoute } from "next";
import { siteConfig, tools } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: new URL(path, siteConfig.url).toString(),
    changeFrequency: "monthly",
    priority,
  });
  return [entry("/", 1), ...tools.map((tool) => entry(tool.href, 0.9)), entry("/privacy", 0.3)];
}
