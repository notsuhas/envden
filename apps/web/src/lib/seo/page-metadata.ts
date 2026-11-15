import type { Metadata } from "next";

interface IDocsPageMeta {
  title: string;
  description?: string | undefined;
  url: string;
  slugs: string[];
}

export function docsImageUrl(slugs: string[]): string {
  return `/og/docs/${[...slugs, "image.png"].join("/")}`;
}

export function docsMetadata(page: IDocsPageMeta): Metadata {
  const image = docsImageUrl(page.slugs);

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.url },
    openGraph: {
      type: "article",
      title: page.title,
      description: page.description,
      url: page.url,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}
