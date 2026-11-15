import { acceptsEnvPath } from "@envden/core/adapters";
import { readConfig } from "../../../settings/config.ts";
import type { TSyncContext } from "../context.ts";
import { appliedFiles, hasAppliedEntry } from "../../local/applied.ts";
import { conflictRecords } from "../../local/conflicts.ts";
import { entryName, readableEntries } from "../content.ts";
import { storePath } from "../../../store/path.ts";

export async function blockedStores(context: TSyncContext, failed: ReadonlySet<string>) {
  const blocked = new Set([
    ...failed,
    ...(await conflictRecords(context.adapters.home)).map((record) => record.store),
  ]);

  const rules = (await readConfig(context.adapters.home))["env-files"];

  for (const link of context.state.links)
    if (!acceptsEnvPath(link.path, rules)) blocked.add(link.store);

  const applied = await appliedFiles(context.adapters.home);

  for (const entry of readableEntries(context)) {
    if (await hasAppliedEntry(context.adapters.home, entry, applied)) continue;
    const name = entryName(context, entry);
    blocked.add(storePath(context.adapters.home, name.repoId, name.path));
  }

  return blocked;
}
