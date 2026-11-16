import { acknowledgeAttempt } from "./remote/attempt/record.ts";
import { commandCounts } from "../output/counts.ts";
import { followServerMove } from "../admin/move/follow.ts";
import { readHistory } from "../vault/history.ts";
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
import { adoptWorktreeAt } from "../links/checkout/worktree.ts";
import { withSyncLock } from "./local/files.ts";
import { conflictRecords } from "./local/conflicts.ts";
import { settleRemoteNotice } from "../notice/remote.ts";
import { refreshNotice } from "../notice/cache.ts";
import { refuseConfiguredPatterns } from "../settings/config.ts";

async function sync(
  adapters: TAdapters,
  options: ISyncOptions,
  pushing: boolean,
  choose?: (path: string) => Promise<"keep-mine" | "take-server" | "merge">,
) {
  if (pushing && !options.interactive && !options.yes)
    throw new EnvdenError(
      "INVALID_INPUT",
      "Without a terminal, push needs --yes to confirm the changes",
    );

  return withSyncLock(adapters.home, async () => {
    await refuseConfiguredPatterns(adapters.home);
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

    await adoptWorktreeAt(
      adapters,
      context.state,
      options.cwd ?? process.cwd(),
      options.report ?? (() => {}),
    );

    const repos = await selectedRepos(adapters, context.state, options, context.skippedRoots);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) history = await readHistory(context.client, context.vaultId, context.state);
      const accepted = await acceptHead(context, history);

      reportRepairs(context, accepted.repairs);

      const result = await syncAttempt(context, repos, accepted.noFastForward, pushing, choose);

      if (result.kind !== "retry") {
        await pruneBackups(adapters.home, options.now());
        await adapters.prunePlacementBackups(options.now());

        try {
          await settleRemoteNotice(context);

          await refreshNotice(
            adapters.home,
            context.state,
            (root) => adapters.repo.caseInsensitive(root, true),
            adapters.now,
          );
        } catch {
          options.report?.("Notice refresh failed; sync completed");
        }

        return result;
      }
    }

    throw new EnvdenError(
      "HEAD_MOVED",
      "Another device kept changing files during sync. Run the command again",
    );
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
  const reports: string[] = [];

  const result = await sync(
    adapters,
    {
      ...options,
      report: (message) => {
        reports.push(message);
        options.report?.(message);
      },
    },
    pushing,
  );

  const counts = commandCounts.getStore();
  if (counts) Object.assign(counts, { changed: result.changed, conflicts: result.conflicts });

  return { ...result, reports };
}

async function syncAttempt(
  context: Awaited<ReturnType<typeof syncContext>>,
  repos: Set<string>,
  noFastForward: ReadonlySet<string>,
  pushing: boolean,
  choose: Parameters<typeof reconcile>[3],
) {
  const adapters = context.adapters;
  await persistCheckpoint(context);
  await acknowledgeAttempt(context);
  const result = await reconcile(context, repos, noFastForward, choose);

  await persistCheckpoint(context);

  if (!pushing)
    return { kind: "pulled" as const, changed: result.changed, conflicts: result.conflicts };

  const conflicts = Math.max(result.conflicts, (await conflictRecords(adapters.home)).length);

  try {
    const uploaded = await uploadChanges(context, repos, result.failedStores);
    await persistCheckpoint(context);

    return {
      kind: conflicts ? ("conflict" as const) : ("pushed" as const),
      changed: uploaded,
      conflicts,
    };
  } catch (error) {
    if (!(error instanceof EnvdenError) || error.code !== "HEAD_MOVED") throw error;

    return { kind: "retry" as const, changed: 0, conflicts };
  }
}
