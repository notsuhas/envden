import { refuseRecoveryProof } from "@envden/core/chain";
import {
  decode,
  signedCodec,
  ManifestHeaderCodec,
  equal,
  H,
  type ISwap,
} from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { IStoredSwap } from "@envden/core/adapters";
import type { IAppOptions, IAuth } from "../http/types.ts";

function repairHistory(options: IAppOptions, vaultId: Uint8Array) {
  const restored = options.storage.vault(vaultId)?.restored;
  const point = restored && options.storage.header(vaultId, restored.restoredHead);

  return point
    ? options.storage
        .headers(vaultId, point.seq + 1n, 0xffffffffffffffffn)
        .map((h) => decode(signedCodec(ManifestHeaderCodec), h.bytes).body)
    : [];
}

export function closeRepair(options: IAppOptions, auth: IAuth, swap: ISwap, stored: IStoredSwap) {
  const { storage } = options;
  const { vaultId } = auth.request;
  const vault = storage.vault(vaultId)!;
  const entry = swap.entries[0]?.body;

  if (
    !vault.restored ||
    entry?.kind !== 6 ||
    !equal(entry.payload.restoredHead, vault.restored.restoredHead) ||
    !equal(entry.payload.repairId, vault.restored.finishProgress!)
  )
    throw new EnvdenError("INVALID_DATA", "Repair identity mismatch");

  const history = repairHistory(options, vaultId);
  const envelope = storage.state(vaultId, "envelope", new Uint8Array());
  const { restored: _restored, ...active } = vault;

  stored.vault = {
    ...active,
    proofRefused:
      vault.proofRefused ||
      refuseRecoveryProof(
        history,
        !!envelope && equal(H("envelope-blob", envelope), swap.header.body.envelopeHash),
      ),
  };

  stored.clearRepairReports = true;
}
