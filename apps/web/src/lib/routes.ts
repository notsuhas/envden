import { createGetUrl } from "fumadocs-core/source";

export const DOCS_ROUTE = "/docs";
export const GETTING_STARTED_ROUTE = `${DOCS_ROUTE}/getting-started`;
export const DOCS_CONTENT_ROUTE = "/llms.mdx/docs";

const MARKDOWN_FILE = "content.md";

const getContentUrl = createGetUrl(DOCS_CONTENT_ROUTE);

export function getPageMarkdownSegments(slugs: string[]): string[] {
  return [...slugs, MARKDOWN_FILE];
}

export function getPageMarkdownUrl(slugs: string[]): string {
  return getContentUrl(getPageMarkdownSegments(slugs));
}
