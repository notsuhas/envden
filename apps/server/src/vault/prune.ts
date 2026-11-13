import type { IAppOptions } from "../http/types.ts";

export function pruneHistory(options: IAppOptions) {
  const ids = options.storage
    .states(new Uint8Array(32), "server-identity")
    .filter((s) => s.key.length === 32 && s.bytes.length === 32);

  return ids.map(({ bytes: vaultId }) =>
    options.storage.prune(vaultId, { maxAge: 90 * 86400000, minVersions: 20 }, options.now()),
  );
}
