import Link from "next/link";
import { Wordmark } from "@/components/site/wordmark.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";

const FOOTER_LINKS = [
  { href: DOCS_ROUTE, label: "Docs" },
  { href: "/llms.txt", label: "llms.txt" },
  { href: "/llms-full.txt", label: "llms-full.txt" },
];

export function Footer() {
  return (
    <footer className="border-t border-den-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
        <div>
          <Wordmark />
          <p className="mt-1 text-sm text-den-muted">MIT license. Self-host only.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5 text-sm">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-den-muted hover:text-den-ink">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
