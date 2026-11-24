import type { IStoredSwap } from "@envden/core/adapters";
import { type ISwap } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { requireMoveMaterial } from "../../move/material.ts";

export function prepareMove(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  stored: IStoredSwap,
  destination: Uint8Array,
) {
  const { storage } = options;
  const { vaultId } = auth.request;
  const vault = storage.vault(vaultId)!;

  if (swap.header.body.op === 10 && !vault.active) {
    requireMoveMaterial(options, vaultId);
    stored.state!.push({ kind: "move-session", key: new Uint8Array() });
  }

  if (swap.header.body.op === 10)
    stored.vault = vault.active
      ? { ...vault, frozen: true, serverMoved: destination }
      : { ...vault, active: true, frozen: false };
}
