import type { TSyncContext } from "../context.ts";
import { heldBackFiles } from "../../local/lineage/held-back.ts";

export async function reportBlocked(context: TSyncContext) {
  for (const notice of await heldBackFiles(context.adapters))
    context.options.report?.(`Held back ${notice.path}: ${notice.reason}`);
}
