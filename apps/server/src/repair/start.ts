import { randomBytes, tokenKey, encodeToken, serverPin, H } from "@envden/core/protocol";
import type { IAppOptions } from "../http/types.ts";

export function startRestored(options: IAppOptions) {
  const { storage } = options;

  const vaults = storage
    .states(new Uint8Array(32), "server-identity")
    .filter((s) => s.key.length === 32 && s.bytes.length === 32 && !!storage.head(s.bytes));

  return storage.transaction(() =>
    vaults.map(({ bytes: id }) => {
      const vault = storage.vault(id)!;
      const secret = randomBytes(20);
      const restoredHead = vault.restored?.restoredHead ?? storage.head(id)!;

      storage.configureVault(id, {
        ...vault,
        restored: {
          repairTokenHash: tokenKey("repair", secret),
          restoredHead,
          finishProgress: H("repair-id", secret),
        },
      });

      storage.writeState(
        id,
        storage.states(id, "repair-report").map((r) => ({ kind: "repair-report", key: r.key })),
      );

      return {
        vaultId: id,
        token: encodeToken("repair", secret, serverPin(options.serverKeys.publicKey)),
      };
    }),
  );
}
