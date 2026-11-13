import { docs } from "collections/server";
import { llms, loader } from "fumadocs-core/source";
import { DOCS_ROUTE } from "@/lib/routes.ts";
import { SITE_URL } from "@/lib/site.ts";

export const source = loader({
  baseUrl: DOCS_ROUTE,
  source: docs.toFumadocsSource(),
});

export const docsLlms = llms(source, {
  renderUrl: (item) => `${SITE_URL}${item.url}.md`,
  renderPage: async (page) => `# ${page.data.title} (${SITE_URL}${page.url})

${await page.data.getText("processed")}`,
});
