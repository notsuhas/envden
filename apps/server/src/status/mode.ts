import type { IStoredVault } from "@envden/core/adapters";
import type { TServerMode } from "@envden/core/protocol";

export function deriveServerMode(vaults: IStoredVault[]): TServerMode {
  if (vaults.some((vault) => vault.restored)) return "restored";
  if (vaults.length > 0 && vaults.every((vault) => vault.serverMoved)) return "moved";

  return "normal";
}
