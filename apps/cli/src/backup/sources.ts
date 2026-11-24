import { relative } from "node:path";
import type { ILocalState } from "../state/model.ts";

interface IBackupSource {
  name: string;
  path: string;
}

interface IBackupSources {
  sources: IBackupSource[];
  missing: number;
}

// The store is the only source; links only name its files, since store folders are hashes of the repo ID.
export function backupSources(
  state: ILocalState | undefined,
  store: string,
  storeFiles: readonly string[],
): IBackupSources {
  const names = linkNames(state);
  const present = new Set(storeFiles);
  const counts = new Map<string, number>();

  for (const path of storeFiles) {
    const name = names.get(path);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sources = storeFiles.map((path) => {
    const name = names.get(path);
    const usable = name !== undefined && counts.get(name) === 1 && safe(name);

    return { name: usable ? name : `unplaced/${relative(store, path)}`, path };
  });

  return {
    sources: sources.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    missing: [...names.keys()].filter((path) => !present.has(path)).length,
  };
}

function linkNames(state: ILocalState | undefined): Map<string, string> {
  const names = new Map<string, string>();

  for (const link of state?.links ?? []) {
    const checkout = state?.approved.find((item) => item?.root === link?.root);
    if (!checkout || typeof link.store !== "string") continue;

    names.set(link.store, `${state?.aliases[checkout.repoId] ?? checkout.repoId}/${link.path}`);
  }

  return names;
}

function safe(name: string): boolean {
  return name.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}
