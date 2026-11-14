import { markAppliedEntry } from "./local/applied.ts";
import { removeCheckoutBases } from "../links/checkout/bases.ts";
import { preserveRemoval } from "./removal/backups.ts";
import { resolve, join } from "node:path";
import { rm } from "node:fs/promises";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import { loadState } from "../state/store/repository.ts";
import { withSyncLock, basePath, writeBytes } from "./local/files.ts";
import { conflictRecords, saveConflicts } from "./local/conflicts.ts";
import { requestDeletion } from "./local/reconciliation/operation/deletion.ts";

export function removeFile(
  adapters: TAdapters,
  path: string,
  options: {
    yes?: boolean;
    interactive?: boolean;
    confirm?: (message: string) => Promise<boolean>;
    now: () => number;
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

    const targets = state!.links.filter((link) => link.store === selected.store && !link.localOnly);
    const records = await conflictRecords(adapters.home);
    const preserved: string[] = [];

    preserved.push(
      ...(await preserveRemoval(adapters, selected.store, targets, records, options.now())),
    );

    await requestDeletion(adapters.home, selected.store, true);
    await rm(basePath(adapters.home, selected.store) + ".pending", { force: true });

    for (const target of targets) {
      await adapters
        .placement(target.mode, target.root)
        .remove(selected.store, join(target.root, target.path));
    }

    await writeBytes(selected.store, undefined);
    await removeCheckoutBases(adapters.home, targets, []);

    for (const record of records.filter((record) => record.store === selected.store))
      if (record.entry) await markAppliedEntry(adapters.home, record.entry);

    await saveConflicts(
      adapters.home,
      records.filter((record) => record.store !== selected.store),
    );

    return {
      kind: "removed" as const,
      path: selected.path,
      preserved,
      publish: "next-push" as const,
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
