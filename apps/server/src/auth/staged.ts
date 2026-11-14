import type { IAppOptions } from "../http/types.ts";
import { equal } from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";

export function requireStagedRecord(
  options: IAppOptions,
  vaultId: Uint8Array,
  device: Uint8Array,
  bytes: Uint8Array,
) {
  const key = { kind: "login", device, purpose: "registration-record" } as const;
  const record = options.storage.session(vaultId, key, options.now());

  if (!record || !equal(record, bytes))
    throw new EnvdenError("UNAUTHORIZED", "Staged registration required");

  return key;
}

export function refundRegistration(options: IAppOptions, vault: Uint8Array, device: Uint8Array) {
  const receiptKey = new TextEncoder().encode("registration-receipt");

  const receipt =
    options.storage.state(vault, "move-session", receiptKey) ??
    options.storage.consumeSession(
      vault,
      { kind: "login", device, purpose: "registration-receipt" },
      options.now(),
    );

  options.storage.writeState(vault, [{ kind: "move-session", key: receiptKey }]);
  if (receipt) options.storage.refund(new TextDecoder().decode(receipt), options.now());
}
