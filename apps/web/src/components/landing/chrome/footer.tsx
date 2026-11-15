import Link from "next/link";
import { WordmarkCanvas } from "@/components/landing/chrome/wordmark/canvas.tsx";
import { DOCS_ROUTE } from "@/lib/routes.ts";
import { ENVDEN_VERSION, GITHUB_URL } from "@/lib/site.ts";

const LINKS = [
  { href: DOCS_ROUTE, label: "Docs" },
  { href: GITHUB_URL, label: "GitHub" },
  { href: `${DOCS_ROUTE}/security`, label: "Security" },
  { href: `${DOCS_ROUTE}/compare`, label: "Compare" },
  { href: `${GITHUB_URL}/releases`, label: "Changelog" },
  { href: `${GITHUB_URL}/blob/main/LICENSE`, label: "MIT license" },
];

export function Footer() {
  return (
    <footer>
      <div className="px-5 pt-12 pb-8 sm:px-8 sm:pt-16">
        <WordmarkCanvas />
        <p className="sr-only">envden</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-den-line px-5 py-5 sm:px-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="den-link text-den-muted">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="den-label">v{ENVDEN_VERSION} alpha</p>
      </div>
    </footer>
  );
}
