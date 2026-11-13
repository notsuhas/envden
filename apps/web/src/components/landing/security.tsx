import Link from "next/link";
import { SECURITY_POINTS } from "@/components/landing/security/points.ts";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Glyph } from "@/components/landing/ui/glyph.tsx";
import { Section } from "@/components/landing/ui/section.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";

export function Security() {
  return (
    <Section
      id="security"
      title={
        <>
          The server <Accent>can't read</Accent> your files.
        </>
      }
    >
      <ul className="den-cells border-t border-den-line sm:grid-cols-2 lg:grid-cols-3">
        {SECURITY_POINTS.map((point) => (
          <li key={point.tag} className="den-cell px-5 py-6 sm:px-8 sm:py-7">
            <p className="den-label flex items-center gap-2 text-den-lantern">
              <Glyph name="check" className="h-3.5 w-3.5" />
              {point.tag}
            </p>
            <p className="mt-3 text-base leading-relaxed text-pretty text-den-ink">{point.text}</p>
          </li>
        ))}
      </ul>
      <p className="border-t border-den-line px-5 py-5 sm:px-8">
        <Link
          href={`${DOCS_ROUTE}/security`}
          className="inline-flex items-center gap-2 text-[15px] font-medium text-den-ink underline decoration-den-line-strong underline-offset-[5px] transition-[text-decoration-color] duration-150 ease-out hover:decoration-den-lantern"
        >
          Read the threat model
          <Glyph name="arrow" className="den-nudge h-4 w-4 text-den-lantern" />
        </Link>
      </p>
    </Section>
  );
}
