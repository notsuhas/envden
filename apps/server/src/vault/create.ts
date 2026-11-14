import { requireStagedRecord, refundRegistration } from "../auth/staged.ts";
import { validateCreation } from "./creation/validate.ts";
import { equal, type ISwap } from "@envden/core/protocol";
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

  const key = requireStagedRecord(options, vaultId, device, swap.opaqueRecord!);

  const authorityKey = { kind: "login", device, purpose: "registration-authority" } as const;
  const authority = storage.session(vaultId, authorityKey, now());

  if (!authority || !equal(authority, storage.setupToken()!))
    throw new EnvdenError("UNAUTHORIZED", "Registration token mismatch");

  stored.consumeSessions = [key, authorityKey];
  stored.setupTokenHash = storage.setupToken()!;
  stored.vault = { active: true, frozen: false, skRefused: false, unlockPeriod: 2592000000 };

  stored.devices = [
    {
      id: device,
      state: {
        unlockedUntil: now() + 2592000000,
        freshUntil: now() + 600000,
        clientVersion: auth.request.clientVersion,
      },
    },
  ];

  return storage.transaction(() => {
    const result = storage.commitSwap(vaultId, undefined, stored, now());

    if (result.kind === "committed") refundRegistration(options, vaultId, device);

    return result;
  });
}

export function createVault(options: IAppOptions, auth: IAuth, swap: ISwap, digest: Uint8Array) {
  const result = options.storage.transaction(() => create(options, auth, swap, digest));

  return result;
}
