import { reconcileUnpublished } from "./unpublished.ts";
import { acceptsEnvPath } from "@envden/core/adapters";
import { readConfig } from "../../settings/config.ts";
import { sanitizeTerminal } from "../../output/sanitize.ts";
import * as p from "@envden/core/protocol";
import { text } from "../../client/encoding.ts";
import type { TSyncContext } from "../remote/context.ts";
import { basePath, readBytes } from "./files.ts";
import { storePath } from "../../store/path.ts";
import { entryName, entryContent } from "../remote/content.ts";
import { appliedFiles, saveAppliedFiles } from "./applied.ts";
import { reconciliationTargets } from "./reconciliation/targets.ts";
import { reconcileTarget } from "./reconciliation/target.ts";

export async function reconcile(
  context: TSyncContext,
  repos: Set<string>,
  oldFiles: p.IFiles,
  noFastForward: ReadonlySet<string>,
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
) {
  const applied = await appliedFiles(context.adapters.home);
  const rules = (await readConfig(context.adapters.home))["env-files"];
  let conflicts = await reconcileUnpublished(context, repos);
  let changed = 0;
  const failedStores = new Set<string>();

  for (const entry of context.checkpoint.files.entries) {
    const beforeConflicts = conflicts;
    const name = entryName(context, entry);
    if (!repos.has(name.repoId)) continue;

    if (!acceptsEnvPath(name.path, rules)) {
      context.options.report?.(sanitizeTerminal(`Skipped env file: ${name.path}`));
      continue;
    }

    const store = storePath(context.adapters.home, name.repoId, name.path);
    const targets = await reconciliationTargets(context, repos, name, store);
    if (!targets.length) continue;
    const server = await serverContent(context, entry, targets[0]!, store, applied);

    for (const target of targets) {
      try {
        const result = await reconcileTarget(
          context,
          target,
          store,
          server,
          entry,
          name,
          oldFiles,
          noFastForward,
          choose,
        );

        changed += result.changed;
        conflicts += result.conflicts;
      } catch {
        failedStores.add(store);
        conflicts++;
        context.options.report?.(sanitizeTerminal(`Could not place env file: ${target.path}`));
      }
    }

    if (targets.length && conflicts === beforeConflicts)
      applied[p.base32(entry.fileId)] = text(p.FileEntryCodec.write(entry));

    await saveAppliedFiles(context.adapters.home, applied);
  }

  await saveAppliedFiles(context.adapters.home, applied);

  return { changed, conflicts, failedStores };
}

async function serverContent(
  context: TSyncContext,
  entry: p.IFileEntry,
  first: TSyncContext["state"]["links"][number],
  store: string,
  applied: Awaited<ReturnType<typeof appliedFiles>>,
) {
  const unchanged = applied[p.base32(entry.fileId)] === text(p.FileEntryCodec.write(entry));

  const baseline = unchanged
    ? await readBytes(
        basePath(context.adapters.home, store, first.mode === "copy" ? first.root : undefined),
      )
    : undefined;

  const server =
    unchanged && (baseline !== undefined || entry.state === 2 || entry.state === 4)
      ? baseline
      : await entryContent(context, entry);

  return server;
}
