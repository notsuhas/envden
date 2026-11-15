import type { TSyncContext } from "../context.ts";
import { heldBackFiles } from "../../local/lineage/held-back.ts";
import { checkoutPath } from "../../local/reconciliation/placement/display.ts";

export async function reportBlocked(context: TSyncContext) {
  for (const notice of await heldBackFiles(context.adapters))
    context.options.report?.(
      `Held back ${checkoutPath(context.options.cwd, notice.path, "")}: ${notice.reason}`,
    );
}
