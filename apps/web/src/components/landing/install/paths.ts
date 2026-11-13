import type { TGlyph } from "@/components/landing/ui/glyph.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";

export const START_PATHS: { href: string; title: string; body: string; glyph: TGlyph }[] = [
  {
    href: `${DOCS_ROUTE}/getting-started/home-lab-first`,
    title: "Home lab first",
    body: "Run the server in Docker on a machine that's always on.",
    glyph: "server",
  },
  {
    href: `${DOCS_ROUTE}/getting-started/laptop-first`,
    title: "Laptop first",
    body: "Run the server on your laptop, and move it later.",
    glyph: "laptop",
  },
  {
    href: `${DOCS_ROUTE}/joining-devices`,
    title: "Add a device",
    body: "Join with a pairing code, or with your recovery kit.",
    glyph: "desktop",
  },
  {
    href: `${DOCS_ROUTE}/agents/setup-prompt`,
    title: "Set up with an agent",
    body: "One prompt to paste into your coding agent.",
    glyph: "link",
  },
];
