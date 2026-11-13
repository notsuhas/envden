import { Banner } from "fumadocs-ui/components/banner";
import { WIP_NOTICE } from "@/lib/site.ts";

export function WipBanner() {
  return (
    <Banner className="bg-den-surface font-mono text-xs text-den-ink">
      <span className="mr-2 text-den-lantern" aria-hidden="true">
        #
      </span>
      {WIP_NOTICE}
    </Banner>
  );
}
