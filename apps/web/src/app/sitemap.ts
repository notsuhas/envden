import type { MetadataRoute } from "next";
import { sitemapEntries } from "@/lib/seo/sitemap-entries.ts";
import { source } from "@/lib/source.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(source.getPages().map((page) => page.url));
}
