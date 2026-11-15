import { diffEnvKeys } from "@envden/core/merge";
import { conflictRecords } from "../../sync/local/conflicts.ts";
import { readBytes } from "../../sync/local/files.ts";
import type { IConflictView } from "./model.ts";
import { keyChanges } from "./key-changes.ts";

export async function conflictViews(home: string): Promise<IConflictView[]> {
  const views: IConflictView[] = [];

  for (const record of await conflictRecords(home)) {
    const mine = record.mineDeleted ? undefined : await readBytes(record.mine);
    const server = record.deleted ? undefined : await readBytes(record.server);

    views.push({
      id: record.file,
      path: record.path,
      roots: record.targets.map((target) => target.root),
      keys: keyChanges(diffEnvKeys(server ?? new Uint8Array(), mine ?? new Uint8Array())),
      serverDeleted: record.deleted,
      mineDeleted: record.mineDeleted,
    });
  }

  return views;
}
