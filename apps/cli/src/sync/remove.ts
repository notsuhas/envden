import { markAppliedEntry } from "./local/applied.ts";
import { removeCheckoutBases } from "../links/checkout/bases.ts";
import { preserveRemoval } from "./removal/backups.ts";
import { resolve, join } from "node:path";
import { rm } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { removalEntry, removalTargets } from "./removal/selection.ts";
import { saveState, loadState } from "../state/store/repository.ts";
import { withSyncLock, basePath, writeBytes } from "./local/files.ts";
import { conflictRecords, saveConflicts } from "./local/conflicts.ts";
import { deletionRequested, requestDeletion } from "./local/reconciliation/operation/deletion.ts";

export function removeFile(
  adapters: TAdapters,
  path: string,
  options: {
    yes?: boolean;
    interactive?: boolean;
    confirm?: (message: string) => Promise<boolean>;
    now: () => number;
    report?: (message: string) => void;
  },
) {
  return withSyncLock(adapters.home, async () => {
    const state = await loadState(adapters.home);
    const absolute = resolve(path);

    const selected = state?.links.find(
      (link) => join(link.root, link.path) === absolute && !link.localOnly,
    );

    if (!selected) throw new EnvdenError("NOT_FOUND", "Env file is not tracked");

    await confirmRemoval(options);

    const { targets, skipped, blocked } = await removalTargets(adapters, state!, selected.store);

    if (blocked)
      return {
        kind: "blocked" as const,
        path: selected.path,
        preserved: [],
        backups: [],
        publish: "none" as const,
        skipped,
      };

    const records = await conflictRecords(adapters.home);

    const backups = await preserveRemoval(
      adapters,
      selected.store,
      targets,
      records,
      options.now(),
      options.report,
    );

    const preserved = backups.map((item) => item.path);
    await requestDeletion(adapters.home, selected.store, false);

    await rm(basePath(adapters.home, selected.store) + ".pending", { force: true });

    for (const target of targets) {
      await adapters
        .placement(target.mode, target.root)
        .remove(selected.store, join(target.root, target.path));
    }

    await writeBytes(selected.store, undefined);
    await removeCheckoutBases(adapters.home, targets, []);

    const entry =
      records.find((record) => record.store === selected.store)?.entry ??
      (await removalEntry(adapters, state!, selected.root, selected.path));

    await requestDeletion(adapters.home, selected.store, true, entry ?? undefined);
    const published = await deletionRequested(adapters.home, selected.store);

    if (!published) {
      state!.links = state!.links.filter((link) => link.store !== selected.store);
      await saveState(adapters.home, state!);
    }

    await settleRemoval(adapters.home, selected.store, records);

    return {
      kind: "removed" as const,
      path: selected.path,
      preserved,
      backups,
      publish: published ? ("next-push" as const) : ("none" as const),
      skipped,
    };
  });
}

async function confirmRemoval(options: Parameters<typeof removeFile>[2]) {
  if (options.yes) return;

  if (!options.interactive || !options.confirm)
    throw new EnvdenError("INVALID_INPUT", "Non-interactive rm requires --yes");

  if (
    !(await options.confirm(
      "Remove this env file everywhere and discard local edits and conflicts? All local content will be backed up.",
    ))
  )
    throw new EnvdenError("INVALID_INPUT", "Removal cancelled");
}

async function settleRemoval(
  home: string,
  store: string,
  records: Awaited<ReturnType<typeof conflictRecords>>,
) {
  for (const record of records.filter((record) => record.store === store))
    if (record.entry) await markAppliedEntry(home, record.entry, record.store);

  await saveConflicts(
    home,
    records.filter((record) => record.store !== store),
  );
}
