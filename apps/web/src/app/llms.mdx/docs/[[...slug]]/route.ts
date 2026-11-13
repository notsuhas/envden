import { notFound } from "next/navigation";
import { getPageMarkdownSegments } from "@/lib/routes.ts";
import { docsLlms, source } from "@/lib/source.ts";

interface IMarkdownRoute {
  params: Promise<{ slug?: string[] }>;
}

export const revalidate = false;

export async function GET(_request: Request, context: IMarkdownRoute) {
  const { slug } = await context.params;
  const page = source.getPage(slug?.slice(0, -1));
  if (!page) notFound();

  return new Response(await docsLlms.page(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

// fallow-ignore-next-line unused-export -- Next.js calls this to prerender each page as Markdown
export function generateStaticParams() {
  return source.getPages().map((page) => ({
    slug: getPageMarkdownSegments(page.slugs),
  }));
}
