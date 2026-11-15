import { expect, test } from "bun:test";
import { docsImageUrl, docsMetadata } from "../page-metadata.ts";
import { sitemapEntries } from "../sitemap-entries.ts";
import { jsonLd, softwareApplication } from "../structured-data.ts";
import { source } from "../../source.ts";
import { SITE_URL } from "../../site.ts";

test("structured data can't close its script tag", () => {
  expect(jsonLd({ name: "</script><script>" })).not.toContain("<");
  expect(JSON.parse(jsonLd(softwareApplication()))["@type"]).toBe("SoftwareApplication");
});

test("docs pages get their own canonical URL, social title and image", () => {
  const meta = docsMetadata({
    title: "Vault",
    description: "Keys",
    url: "/docs/vault",
    slugs: ["vault"],
  });

  expect(meta.alternates?.canonical).toBe("/docs/vault");
  expect(meta.openGraph?.title).toBe("Vault");
  expect(meta.twitter?.title).toBe("Vault");
  expect(docsImageUrl([])).toBe("/og/docs/image.png");
  expect(docsImageUrl(["agents", "setup-prompt"])).toBe("/og/docs/agents/setup-prompt/image.png");
});

test("the sitemap lists the home page and every docs page once", () => {
  const urls = sitemapEntries(source.getPages().map((page) => page.url)).map((entry) => entry.url);

  expect(urls[0]).toBe(SITE_URL);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls.length).toBe(source.getPages().length + 1);
});
