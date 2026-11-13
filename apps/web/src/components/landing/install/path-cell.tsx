import Link from "next/link";
import { Glyph } from "@/components/landing/ui/glyph.tsx";
import type { TGlyph } from "@/components/landing/ui/glyph.tsx";

interface IPathCell {
  href: string;
  title: string;
  body: string;
  glyph: TGlyph;
}

export function PathCell(props: IPathCell) {
  const { href, title, body, glyph } = props;

  return (
    <Link
      href={href}
      className="den-cell-link flex gap-4 px-5 py-6 -outline-offset-2 sm:px-6 sm:py-7"
    >
      <span className="den-dots flex h-12 w-12 shrink-0 items-center justify-center border border-den-ink text-den-lantern">
        <Glyph name={glyph} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="den-heading text-lg text-den-ink">{title}</span>
          <Glyph name="arrow" className="den-nudge h-4 w-4 text-den-lantern" />
        </span>
        <span className="mt-1.5 block text-sm leading-relaxed text-pretty text-den-muted">
          {body}
        </span>
      </span>
    </Link>
  );
}
