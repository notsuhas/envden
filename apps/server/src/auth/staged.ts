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
