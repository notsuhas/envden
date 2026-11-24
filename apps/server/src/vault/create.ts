import { validateCreation } from "./creation/validate.ts";
import { type ISwap } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { hasProof } from "../auth/token.ts";
import { storedSwap } from "./material.ts";

function create(options: IAppOptions, auth: IAuth, swap: ISwap, digest: Uint8Array) {
  const { storage, now } = options;
  const { vaultId, device } = auth.request;
  const stored = storedSwap(swap, digest);

  if (storage.hasVault(vaultId)) {
    if (storage.findCommitted(vaultId, digest)) return { kind: "retry-of-committed" as const };
    throw new EnvdenError("CONFLICT", "Vault already exists");
  }

  if (!hasProof(options, auth, "setup"))
    throw new EnvdenError("UNAUTHORIZED", "Setup proof required");

  validateCreation(swap, vaultId, device, options.serverKeys.publicKey);

  stored.setupTokenHash = storage.setupToken()!;
  stored.vault = { active: true, frozen: false, proofRefused: false };
  stored.devices = [{ id: device, state: { clientVersion: auth.request.clientVersion } }];

  return storage.commitSwap(vaultId, undefined, stored, now());
}

export function createVault(options: IAppOptions, auth: IAuth, swap: ISwap, digest: Uint8Array) {
  return options.storage.transaction(() => create(options, auth, swap, digest));
}
