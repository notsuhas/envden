import { verifyGenesis } from "./genesis/validate.ts";
import { type ISwap } from "@envden/core/protocol";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { verifyHistory } from "./history.ts";
import { storedSwap } from "../vault/material.ts";

export function uploadHistory(
  options: IAppOptions,
  auth: IAuth,
  swap: ISwap,
  digest: Uint8Array,
  checkUploader = true,
) {
  const { storage, now } = options;
  const vaultId = auth.request.vaultId;
  const stored = storedSwap(swap, digest);

  stored.state = stored.state!.filter(
    (write) => !storage.vault(vaultId)?.restored || write.kind !== "proofPub",
  );

  const current = storage.head(vaultId);

  if (current) {
    if (storage.findCommitted(vaultId, digest)) return { kind: "retry-of-committed" as const };
  }

  if (!current) {
    verifyGenesis(options, auth, swap, checkUploader);

    return storage.commitSwap(vaultId, undefined, stored, now());
  }

  verifyHistory(options, auth, swap, checkUploader);

  return storage.commitSwap(vaultId, swap.expectedHead, stored, now());
}
