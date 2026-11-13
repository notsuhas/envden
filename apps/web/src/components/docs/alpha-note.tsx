import { asMarkdown } from "fumadocs-core/server";
import { Callout } from "fumadocs-ui/components/callout";
import { ALPHA_NOTICE, ENVDEN_VERSION } from "@/lib/site.ts";

const ALPHA_DETAIL = `This is v${ENVDEN_VERSION}. Commands and wording may change.`;

export function AlphaNote() {
  if (asMarkdown()) return `\n> **${ALPHA_NOTICE}.** ${ALPHA_DETAIL}\n`;

  return (
    <Callout type="warn" title={ALPHA_NOTICE}>
      {ALPHA_DETAIL}
    </Callout>
  );
}
