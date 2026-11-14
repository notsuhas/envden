import { PromptCancelled } from "../../state/cancelled.ts";
import { EnvdenError } from "@envden/core/errors";
import { collisionEntries } from "./validation/entries.ts";
import { reconcileUnpublished } from "./unpublished.ts";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readConfig } from "../../settings/config.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import * as p from "@envden/core/protocol";
import { text } from "../../client/encoding.ts";
import type { TSyncContext } from "../remote/context.ts";

import { storePath } from "../../store/path.ts";
import { entryName } from "../remote/content.ts";
import { appliedFiles, saveAppliedFiles } from "./applied.ts";
import { reconciliationTargets } from "./reconciliation/targets.ts";
import { reconcileFile } from "./reconciliation/file.ts";

export async function reconcile(
  context: TSyncContext,
  repos: Set<string>,
  noFastForward: ReadonlySet<string>,
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];
  const unpublished = await reconcileUnpublished(context, repos);
  let conflicts = unpublished.conflicts;
  let changed = 0;
  const failedStores = unpublished.failedStores;

  const collisions = await collisionEntries(context, repos);

  for (const entry of selectedEntries(context, repos, rules)) {
    const beforeConflicts = conflicts;
    const name = entryName(context, entry);
    const store = storePath(context.adapters.home, name.repoId, name.path);

    if (collisions.has(entry)) {
      failedStores.add(store);
      conflicts++;
      report(context, `Could not place env file: ${name.path}`);
      continue;
    }

    try {
      const targets = await reconciliationTargets(context, repos, name, store);
      if (!targets.length) continue;
      const result = await reconcileFile(context, targets, store, entry, noFastForward, choose);
      changed += result.changed;
      conflicts += result.conflicts;
    } catch (error) {
      reportPlacementFailure(context, name.path, error);
      failedStores.add(store);
      conflicts++;
    }

    if (conflicts === beforeConflicts)
      applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));

    await saveAppliedFiles(context.adapters.home, applied);
  }

  await saveAppliedFiles(context.adapters.home, applied);

  return { changed, conflicts, failedStores };
}

function report(context: TSyncContext, message: string) {
  context.options.report?.(sanitizeTerminal(message));
}

function selectedEntries(
  context: TSyncContext,
  repos: Set<string>,
  rules: Parameters<typeof acceptsEnvPath>[1],
) {
  return context.checkpoint.files.entries.filter((entry) => {
    const name = entryName(context, entry);
    if (!repos.has(name.repoId)) return false;
    if (acceptsEnvPath(name.path, rules)) return true;
    report(context, `Skipped env file: ${name.path}`);

    return false;
  });
}

function reportPlacementFailure(context: TSyncContext, path: string, error: unknown) {
  if (error instanceof PromptCancelled) throw error;
  const code = error instanceof EnvdenError ? error.code : "UNKNOWN";
  report(context, `Could not place env file (${code}): ${path}`);
}
