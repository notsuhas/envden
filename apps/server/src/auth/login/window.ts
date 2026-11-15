import { UnlockWindowSchema } from "@envden/core/protocol";
import type { IAppOptions } from "../../http/types.ts";

export function unlockWindow(options: IAppOptions, vaultId: Uint8Array, device: Uint8Array) {
  const { storage } = options;
  const state = storage.device(vaultId, device)!;

  return UnlockWindowSchema.parse({
    unlockedUntil: storage.vault(vaultId)?.unlockPeriod === null ? null : state.unlockedUntil,
    freshUntil: state.freshUntil,
  });
}
