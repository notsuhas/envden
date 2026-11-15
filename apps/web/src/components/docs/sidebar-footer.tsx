import { GithubMark } from "@/components/site/github-mark.tsx";
import { ENVDEN_VERSION, GITHUB_URL } from "@/lib/site.ts";

export function SidebarFooter() {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-den-line px-4 py-3">
      <span className="den-label">v{ENVDEN_VERSION} alpha</span>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-den-muted hover:text-den-ink active:text-den-lantern"
      >
        <GithubMark />
        GitHub
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
