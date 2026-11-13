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
    await pruneBackups(adapters.home, options.now());
    const context = await syncContext(adapters, options);

    const followed = await followServerMove(
      {
        adapters,
        local: context.state,
        identity: context.identity,
        vaultId: context.vaultId,
        client: context.client,
        now: options.now,
      },
      await readHistory(context.client, context.vaultId),
      options.fetcher,
      options.unlock,
    );

    if (followed.kind === "moved") context.client = followed.client;
    const repos = await selectedRepos(adapters, context.state, options);
    let changed = 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const old = context.checkpoint.files;
      const accepted = await acceptHead(context);

      reportRepairs(context, accepted.repairs);

      const result = await reconcile(context, repos, old, accepted.noFastForward, choose);
      changed += result.changed;
      await persistCheckpoint(context);
      if (!pushing) return { kind: "pulled" as const, changed, conflicts: result.conflicts };

      if (result.conflicts || (await conflictRecords(adapters.home)).length)
        return { kind: "conflict" as const, changed, conflicts: result.conflicts };

      try {
        const uploaded = await uploadChanges(context, repos);
        await persistCheckpoint(context);

        return { kind: "pushed" as const, changed: uploaded, conflicts: 0 };
      } catch (error) {
        if (!(error instanceof EnvdenError) || error.code !== "HEAD_MOVED") throw error;
      }
    }

    throw new EnvdenError("HEAD_MOVED", "Head kept moving; retry envden push");
  });
}

export function push(adapters: TAdapters, options: ISyncOptions) {
  return sync(adapters, options, true);
}

export function pull(adapters: TAdapters, options: ISyncOptions) {
  return sync(adapters, options, false);
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
