import { join } from "node:path";
import { acceptsEnvPath } from "@envden/core/adapters";
import type { TSyncContext } from "../context.ts";
import { readConfig } from "../../../settings/config.ts";

export async function reportBlocked(context: TSyncContext, blocked: ReadonlySet<string>) {
  const rules = (await readConfig(context.adapters.home))["env-files"];

  const notices = context.state.links
    .filter((link) => !link.localOnly)
    .flatMap((link) => {
      const path = join(link.root, link.path);

      const reason = context.skippedRoots.has(link.root)
        ? "checkout needs approval; run envden track"
        : !acceptsEnvPath(link.path, rules)
          ? "excluded by env-files; update envden config env-files"
          : blocked.has(link.store)
            ? "unapplied content, conflict or failed placement; run envden pull and envden resolve --list"
            : undefined;

      return reason ? [{ path, reason }] : [];
    });

  for (const notice of notices)
    context.options.report?.(`Held back ${notice.path}: ${notice.reason}`);
}
