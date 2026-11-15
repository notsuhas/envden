import { notFound } from "next/navigation";
import { renderSocialCard } from "@/lib/seo/social-card.tsx";
import { source } from "@/lib/source.ts";

interface IDocsImageRoute {
  params: Promise<{ slug: string[] }>;
}

export async function GET(_request: Request, props: IDocsImageRoute) {
  const { slug } = await props.params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return renderSocialCard({ title: page.data.title, description: page.data.description });
}
