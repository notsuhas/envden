import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site.ts";

export function sitemapEntries(docsUrls: string[]): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...docsUrls.map((url) => ({
      url: `${SITE_URL}${url}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
