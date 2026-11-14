import { membership } from "../chain.ts";
import { H, equal, TransferResponseSchema } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../../http/types.ts";
import { requireGate } from "../../middleware/gates.ts";
import { requireRepair } from "../authorization.ts";

function upload(options: IAppOptions, auth: IAuth, hash: Uint8Array, bytes: Uint8Array) {
  const { storage } = options;
  auth = { ...auth, member: !!membership(storage, auth.request.vaultId, auth.request.device) };
  const vault = storage.vault(auth.request.vaultId)!;

  if (vault.restored) {
    if (!auth.member) throw new EnvdenError("NOT_MEMBER", "Membership required");
    requireRepair(options, auth);
  } else if (!vault.active) {
    const owner = storage.state(auth.request.vaultId, "move-session", new Uint8Array());

    if (!owner || !equal(owner, auth.request.device))
      throw new EnvdenError("MOVING", "Vault moving");
  } else requireGate(options, auth, "unlocked");

  if (bytes.length > 16777216 || !bytes.length || !equal(H("blob", bytes), hash))
    throw new EnvdenError("INVALID_INPUT", "Invalid blob");

  storage.putBlob(auth.request.vaultId, hash, bytes, (b) => H("blob", b), options.now());

  return TransferResponseSchema.parse({ kind: "uploaded" });
}

export function uploadBlob(options: IAppOptions, auth: IAuth, hash: Uint8Array, bytes: Uint8Array) {
  return options.storage.transaction(() => upload(options, auth, hash, bytes));
}
