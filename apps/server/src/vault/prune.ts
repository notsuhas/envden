import type { IAppOptions } from "../http/types.ts";

function pruneHistory(options: IAppOptions) {
  return options.storage
    .vaultIds()
    .map((vaultId) =>
      options.storage.prune(vaultId, { maxAge: 90 * 86400000, minVersions: 20 }, options.now()),
    );
}

export function pruneHistorySafely(options: IAppOptions): void {
  try {
    pruneHistory(options);
  } catch {
    console.error("envden history pruning failed");
  }
}
