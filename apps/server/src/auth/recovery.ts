import { RecoveryTicketResponseSchema, equal, verifyRecoveryProof } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IStorageAdapter } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../http/types.ts";
import { text } from "../http/encoding.ts";

const UNKNOWN = new Uint8Array(32);

// A server holds few vaults, so a scan replaces an index that could fall out of step with commits.
function vaultForProofKey(storage: IStorageAdapter, proofPub: Uint8Array) {
  return storage.vaultIds().find((vaultId) => {
    const stored = storage.state(vaultId, "proofPub", new Uint8Array());

    return !!stored && equal(stored, proofPub);
  });
}

// Only failed proofs count, so knowing the public key alone can't lock out the holder of the code.
export function issueRecoveryTicket(options: IAppOptions, auth: IAuth, proofPub: Uint8Array) {
  const { storage, now } = options;
  const { request, proof } = auth;
  const vaultId = vaultForProofKey(storage, proofPub);
  const vault = vaultId && storage.vault(vaultId);

  if (!vaultId || !vault || !proof || !verifyRecoveryProof(proofPub, request, proof).ok) {
    const charge = storage.charge(vaultId ?? UNKNOWN, { kind: "recovery" }, now());
    if (charge.kind === "locked") throw new EnvdenError("RATE_LIMITED", "Too many attempts");

    throw new EnvdenError("UNAUTHORIZED", "Recovery code not accepted");
  }

  if (vault.proofRefused) throw new EnvdenError("RECOVERY_CODE_REQUIRED", "Recovery code is stale");
  if (vault.restored) throw new EnvdenError("RESTORED_MODE", "Repair required");
  if (!vault.active) throw new EnvdenError("MOVING", "Vault moving");

  storage.putSession(
    vaultId,
    { kind: "join-ticket", device: request.device, purpose: "recovery" },
    new Uint8Array([1]),
    now(),
  );

  return RecoveryTicketResponseSchema.parse({ vaultId: text(vaultId) });
}
