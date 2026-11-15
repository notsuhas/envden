import { milliseconds } from "date-fns";
import { repairLoginDecision, refuseSecretKeyProof } from "@envden/core/chain";
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

export function repairHistory(options: IAppOptions, vaultId: Uint8Array) {
  const restored = options.storage.vault(vaultId)?.restored;
  const point = restored && options.storage.header(vaultId, restored.restoredHead);

  return point
    ? options.storage
        .headers(vaultId, point.seq + 1n, 0xffffffffffffffffn)
        .map((h) => decode(signedCodec(ManifestHeaderCodec), h.bytes).body)
    : [];
}

export function closeRepair(options: IAppOptions, auth: IAuth, swap: ISwap, stored: IStoredSwap) {
  const { storage, now } = options;
  const { vaultId, device } = auth.request;
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

  if (repairLoginDecision(history) === "login") {
    const key = { kind: "login", device, purpose: "repair-finish" } as const;

    const login = storage.session(vaultId, key, now());

    if (!login || !equal(login, vault.restored.repairTokenHash))
      throw new EnvdenError("UNAUTHORIZED", "Finishing login required");

    stored.consumeSessions = [...(stored.consumeSessions ?? []), key];
  }

  if (repairLoginDecision(history) === "register") {
    const key = { kind: "login", device, purpose: "registration-repair" } as const;
    const authority = storage.session(vaultId, key, now());

    if (!authority || !equal(authority, vault.restored.repairTokenHash))
      throw new EnvdenError("UNAUTHORIZED", "Finishing registration required");

    stored.consumeSessions = [...(stored.consumeSessions ?? []), key];
  }

  const envelope = storage.state(vaultId, "envelope", new Uint8Array());
  const { restored: _restored, ...active } = vault;

  stored.vault = {
    ...active,
    skRefused:
      vault.skRefused ||
      refuseSecretKeyProof(
        history,
        !!envelope && equal(H("envelope-blob", envelope), swap.header.body.envelopeHash),
      ),
  };

  stored.clearRepairReports = true;

  stored.devices = [
    {
      id: device,
      state: {
        unlockedUntil: now() + (vault.unlockPeriod ?? milliseconds({ days: 30 })),
        freshUntil: now() + milliseconds({ minutes: 10 }),
        clientVersion: auth.request.clientVersion,
      },
    },
  ];
}
