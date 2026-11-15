import { EnvdenError } from "@envden/core/errors";

import type { IAppOptions } from "../http/types.ts";

const policy = { maxAge: 90 * 86400000, minVersions: 20 };

function pruneSafely(run: () => void) {
  try {
    run();
  } catch (error) {
    const code = error instanceof EnvdenError ? `: ${error.code}` : "";
    console.error(`envden history pruning failed${code}`);
  }
}

export function pruneHistorySafely(options: IAppOptions): void {
  pruneSafely(() => options.storage.prune(new Uint8Array(32), policy, options.now()));

  pruneSafely(() => {
    for (const vaultId of options.storage.vaultIds())
      pruneSafely(() => options.storage.prune(vaultId, policy, options.now()));
  });
}
