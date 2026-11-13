import { Banner } from "fumadocs-ui/components/banner";
import { ALPHA_BANNER } from "@/lib/site.ts";

export function AlphaBanner() {
  return (
    <Banner className="pointer-events-none overflow-hidden border-b border-den-line bg-den-surface font-mono text-xs text-den-ink">
      <span className="den-caution" aria-hidden="true" />
      <span className="relative flex items-center gap-2.5">
        <span className="den-pulse h-1.5 w-1.5 rounded-full bg-den-lantern" aria-hidden="true" />
        {ALPHA_BANNER}
      </span>
    </Banner>
  );
}
