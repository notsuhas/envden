import { join } from "node:path";
import type { TAdapters } from "../../adapters.ts";
import type { ILocalState } from "../../state/model.ts";
import { backup, type IConflictRecord } from "../local/conflicts.ts";

export async function preserveRemoval(
  adapters: TAdapters,
  store: string,
  targets: ILocalState["links"],
  records: IConflictRecord[],
  now: number,
  report?: (message: string) => void,
) {
  const preserved: { source: string; path: string }[] = [];

  const paths = [
    store,
    ...targets.filter((link) => link.mode === "copy").map((link) => join(link.root, link.path)),
  ];

  for (const record of records.filter((record) => record.store === store))
    paths.push(record.file, record.mine, record.server, record.remote, ...record.alternatives);

  for (const target of targets.filter((target) => target.mode === "link")) {
    const destination = join(target.root, target.path);

    if ((await adapters.placement("link", target.root).inspect(store, destination)) === "detached")
      paths.push(destination);
  }

  for (const source of paths) {
    const saved = await backup(adapters.home, source, now);

    if (saved) {
      preserved.push({ source, path: saved });
      report?.(`Saved ${source}: ${saved}`);
    }
  }

  return preserved;
}
