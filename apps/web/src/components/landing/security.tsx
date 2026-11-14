import Link from "next/link";
import { SECURITY_POINTS } from "@/components/landing/security/points.ts";
import { cipherLine } from "@/components/landing/content/cipher.ts";
import { Accent } from "@/components/landing/ui/accent.tsx";
import { Section } from "@/components/landing/ui/section.tsx";
import { Window } from "@/components/landing/ui/window/window.tsx";
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
      aside={
        <Link
          className="den-link inline-flex min-h-11 items-center text-sm text-den-ink"
          href={`${DOCS_ROUTE}/security`}
        >
          Read the threat model →
        </Link>
      }
    >
      <div className="den-dots grid gap-6 border-t border-den-line p-3 sm:p-6 lg:grid-cols-[2fr_3fr] lg:p-8">
        <Window title="server.sqlite">
          <div className="overflow-hidden p-4 font-mono text-[13px] leading-6 text-den-cipher">
            {[17, 83, 149, 211, 277].map((seed) => (
              <div key={seed} className="mb-3">
                <p className="text-den-muted">id: {cipherLine(18, seed)}</p>
                <p className="den-fade-right whitespace-nowrap">{cipherLine(64, seed + 1)}</p>
              </div>
            ))}
          </div>
        </Window>
        <Window title="threat-model.txt">
          <ul className="space-y-3 p-4 font-mono text-[13px] leading-6 text-den-ink sm:p-6">
            {SECURITY_POINTS.map((point) => (
              <li key={point.tag} className="flex gap-3">
                <span className="text-den-lantern">[x]</span>
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </Window>
      </div>
    </Section>
  );
}
