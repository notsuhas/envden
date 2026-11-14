import { sanitizeTerminal } from "../../output/sanitize.ts";
import * as p from "@envden/core/protocol";
import type { TSyncContext } from "../remote/context.ts";
import { reconcileFile } from "./reconciliation/file.ts";
import { PromptCancelled } from "../../state/cancelled.ts";

export async function reconcileUnpublished(context: TSyncContext, repos: Set<string>) {
  let conflicts = 0;
  const failedStores = new Set<string>();
  const seen = new Set<string>();

  for (const link of context.state.links) {
    if (!isUnpublished(context, repos, link)) continue;

    try {
      if (seen.has(link.store)) continue;
      seen.add(link.store);

      const targets = context.state.links.filter(
        (item) =>
          item.store === link.store && !item.localOnly && !context.skippedRoots.has(item.root),
      );

      conflicts += (await reconcileFile(context, targets, link.store, undefined, new Set()))
        .conflicts;
    } catch (error) {
      if (error instanceof PromptCancelled) throw error;
      failedStores.add(link.store);
      conflicts++;

      context.options.report?.(
        sanitizeTerminal(`Could not place unpublished env file: ${link.path}`),
      );
    }
  }

  return { conflicts, failedStores };
}

function isUnpublished(
  context: TSyncContext,
  repos: Set<string>,
  link: TSyncContext["state"]["links"][number],
) {
  const checkout = context.state.approved.find((item) => item.root === link.root);
  if (!checkout || link.localOnly || context.skippedRoots.has(link.root)) return false;
  const repoId = context.state.aliases[checkout.repoId] ?? checkout.repoId;
  if (!repos.has(repoId)) return false;
  const id = p.fileId(context.checkpoint.idKey, repoId, link.path);
  if (context.checkpoint.files.entries.some((entry) => p.equal(entry.fileId, id))) return false;

  return true;
}
