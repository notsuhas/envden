import type { TSyncContext } from "../context.ts";
import { appliedFiles, hasAppliedEntry } from "../../local/applied.ts";
import { conflictRecords } from "../../local/conflicts.ts";
import { entryName } from "../content.ts";
import { storePath } from "../../../store/path.ts";

export async function blockedStores(context: TSyncContext, failed: ReadonlySet<string>) {
  const blocked = new Set([
    ...failed,
    ...(await conflictRecords(context.adapters.home)).map((record) => record.store),
  ]);

  const applied = await appliedFiles(context.adapters.home);

  for (const entry of context.checkpoint.files.entries) {
    if (await hasAppliedEntry(context.adapters.home, entry, applied)) continue;
    const name = entryName(context, entry);
    blocked.add(storePath(context.adapters.home, name.repoId, name.path));
  }

  return blocked;
}
