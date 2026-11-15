import { randomBytes, tokenKey, encodeToken, serverPin, H } from "@envden/core/protocol";
import type { IAppOptions } from "../http/types.ts";
import type { IStoredVault } from "@envden/core/adapters";

type TRestoreKind = "repair" | "moving" | "moved";

// A moved-away vault must stay readable so lagging devices find the server-moved entry.
export function restoreKind(vault: IStoredVault): TRestoreKind {
  if (vault.serverMoved) return "moved";
  if (!vault.active) return "moving";

  return "repair";
}

export const restoreNotice: Record<TRestoreKind, string> = {
  repair: "",
  moving: "not restored: unfinished move destination; resume or abort the move",
  moved: "not restored: moved to another server and read-only",
};

interface IRestoredVault {
  vaultId: Uint8Array;
  kind: TRestoreKind;
  token?: string;
}

export function startRestored(options: IAppOptions): IRestoredVault[] {
  const { storage } = options;

  const vaults = storage.vaultIds().filter((id) => !!storage.head(id));

  return storage.transaction(() =>
    vaults.map((id) => {
      const vault = storage.vault(id)!;
      const kind = restoreKind(vault);

      if (kind !== "repair") return { vaultId: id, kind };

      const secret = randomBytes(20);
      const restoredHead = vault.restored?.restoredHead ?? storage.head(id)!;

      // A move the backup caught mid-way is voided, as an unfreeze would.
      storage.configureVault(
        id,
        {
          ...vault,
          frozen: false,
          restored: {
            repairTokenHash: tokenKey("repair", secret),
            restoredHead,
            finishProgress: H("repair-id", secret),
          },
        },
        [
          { kind: "move-session", key: new Uint8Array() },
          ...storage
            .states(id, "repair-report")
            .map((r) => ({ kind: "repair-report" as const, key: r.key })),
        ],
      );

      return {
        vaultId: id,
        kind,
        token: encodeToken("repair", secret, serverPin(options.serverKeys.publicKey)),
      };
    }),
  );
}
