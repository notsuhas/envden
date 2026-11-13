import { withStateLock } from "../state/lock/lock.ts";
import { join } from "node:path";
import { diffEnvKeys } from "@envden/core/merge";
import type { TAdapters } from "../adapters.ts";
import type { ISyncOptions } from "./model.ts";
import { syncContext } from "./remote/context.ts";
import { selectedRepos } from "./local/selection.ts";
import { readBytes, basePath } from "./local/files.ts";

async function lockedDiff(adapters: TAdapters, options: ISyncOptions) {
  const context = await syncContext(adapters, options);
  const repos = await selectedRepos(adapters, context.state, options);
  const result = [];

  for (const link of context.state.links) {
    if (!includeLink(context.state, link, repos)) continue;

    const before = await readBytes(
      basePath(adapters.home, link.store, link.mode === "copy" ? link.root : undefined),
    );

    const after = await readBytes(link.mode === "link" ? link.store : join(link.root, link.path));

    result.push({
      path: link.path,
      ...diffEnvKeys(before ?? new Uint8Array(), after ?? new Uint8Array()),
    });
  }

  return result;
}

export function diff(...args: Parameters<typeof lockedDiff>) {
  return withStateLock(args[0].home, () => lockedDiff(...args));
}

export function includeLink(
  state: Awaited<ReturnType<typeof syncContext>>["state"],
  link: Awaited<ReturnType<typeof syncContext>>["state"]["links"][number],
  repos: Set<string>,
) {
  const approved = state.approved.find((item) => item.root === link.root);

  return (
    !!approved && !link.localOnly && repos.has(state.aliases[approved.repoId] ?? approved.repoId)
  );
}
