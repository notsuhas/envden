import { EnvdenError } from "@envden/core/errors";

import type { IAppOptions } from "../http/types.ts";

const policy = { maxAge: 90 * 86400000, minVersions: 20 };

function pruneSafely(run: () => unknown): boolean {
  try {
    run();

    return true;
  } catch (error) {
    const code = error instanceof EnvdenError ? `: ${error.code}` : "";
    console.error(`envden history pruning failed${code}`);

    return false;
  }
}

// Returns whether the server and every vault pruned cleanly.
export function pruneHistorySafely(options: IAppOptions): boolean {
  const prune = (vaultId: Uint8Array) =>
    pruneSafely(() => options.storage.prune(vaultId, policy, options.now()));

  const server = prune(new Uint8Array(32));
  let vaults: boolean[] = [];

  const listed = pruneSafely(() => {
    vaults = options.storage.vaultIds().map(prune);
  });

  return server && listed && vaults.every(Boolean);
}
