import { commandCounts } from "../output/counts.ts";
import { followServerMove } from "../admin/move/follow.ts";
import { readHistory } from "../vault/history.ts";
import { pruneBackups as prunePlacementBackups } from "@envden/adapter-placement-fs";
import { join } from "node:path";
import { pruneBackups } from "./local/retention.ts";
import { entryName } from "./remote/content.ts";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { ISyncOptions } from "./model.ts";
import { syncContext } from "./remote/context.ts";
import { acceptHead } from "./remote/accept.ts";
import { persistCheckpoint } from "./remote/persist.ts";
import { uploadChanges } from "./remote/push.ts";
import { reconcile } from "./local/reconcile.ts";
import { selectedRepos } from "./local/selection.ts";
import { withSyncLock } from "./local/files.ts";
import { conflictRecords } from "./local/conflicts.ts";

async function sync(
  adapters: TAdapters,
  options: ISyncOptions,
  pushing: boolean,
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
) {
  if (pushing && !options.interactive && !options.yes)
    throw new EnvdenError("INVALID_INPUT", "Non-interactive push requires --yes");

  return withSyncLock(adapters.home, async () => {
    const context = await syncContext(adapters, options);

    let history = await readHistory(context.client, context.vaultId, context.state);

    const followed = await followServerMove(
      {
        adapters,
        local: context.state,
        identity: context.identity,
        vaultId: context.vaultId,
        client: context.client,
        now: options.now,
      },
      history,
      options.fetcher,
      options.unlock,
    );

    if (followed.kind === "moved") {
      context.client = followed.client;
      history = await readHistory(context.client, context.vaultId, context.state);
    }

    const repos = await selectedRepos(adapters, context.state, options);
    let changed = 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const old = context.checkpoint.files;
      if (attempt) history = await readHistory(context.client, context.vaultId, context.state);
      const accepted = await acceptHead(context, history);

      reportRepairs(context, accepted.repairs);

      const result = await syncAttempt(
        context,
        repos,
        old,
        accepted.noFastForward,
        pushing,
        choose,
      );

      changed += result.changed;

      if (result.kind !== "retry") {
        await pruneBackups(adapters.home, options.now());
        await prunePlacementBackups(join(adapters.home, "conflicts"), options.now(), 30);

        return { ...result, changed };
      }
    }

    throw new EnvdenError("HEAD_MOVED", "Head kept moving; retry envden push");
  });
}

export function push(adapters: TAdapters, options: ISyncOptions) {
  return countedSync(adapters, options, true);
}

export function pull(adapters: TAdapters, options: ISyncOptions) {
  return countedSync(adapters, options, false);
}

export function firstSync(
  adapters: TAdapters,
  options: ISyncOptions,
  choose: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
) {
  return sync(adapters, options, false, choose);
}

function reportRepairs(
  context: Awaited<ReturnType<typeof syncContext>>,
  repairs: Parameters<typeof entryName>[1][],
) {
  for (const repair of repairs)
    context.options.report?.(
      `Repair changed file ${entryName(context, repair).path}: ${repair.state === 4 ? "lost" : "restored"}`,
    );
}

async function countedSync(adapters: TAdapters, options: ISyncOptions, pushing: boolean) {
  const result = await sync(adapters, options, pushing);
  const counts = commandCounts.getStore();
  if (counts) Object.assign(counts, { changed: result.changed, conflicts: result.conflicts });

  return result;
}

async function syncAttempt(
  context: Awaited<ReturnType<typeof syncContext>>,
  repos: Set<string>,
  old: Parameters<typeof reconcile>[2],
  noFastForward: ReadonlySet<string>,
  pushing: boolean,
  choose: Parameters<typeof reconcile>[4],
) {
  const adapters = context.adapters;
  await persistCheckpoint(context);
  const result = await reconcile(context, repos, old, noFastForward, choose);

  await persistCheckpoint(context);

  if (!pushing)
    return { kind: "pulled" as const, changed: result.changed, conflicts: result.conflicts };

  if (result.conflicts || (await conflictRecords(adapters.home)).length)
    return { kind: "conflict" as const, changed: result.changed, conflicts: result.conflicts };

  try {
    const uploaded = await uploadChanges(context, repos);
    await persistCheckpoint(context);

    return { kind: "pushed" as const, changed: uploaded, conflicts: 0 };
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "HEAD_MOVED") throw error;

    return { kind: "retry" as const, changed: result.changed };
  }
}
