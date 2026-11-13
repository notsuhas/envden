import { randomBytes, tokenKey, encodeToken, serverPin, H } from "@envden/core/protocol";
import type { IAppOptions } from "../http/types.ts";

export function startRestored(options: IAppOptions) {
  const { storage } = options;

  const vaults = storage.vaultIds().filter((id) => !!storage.head(id));

  return storage.transaction(() =>
    vaults.map((id) => {
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
