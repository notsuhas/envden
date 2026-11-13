import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { AlphaNote } from "@/components/docs/alpha-note.tsx";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    AlphaNote,
    ...components,
  } satisfies MDXComponents;
}
