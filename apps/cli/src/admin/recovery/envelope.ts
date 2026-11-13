import * as p from "@envden/core/protocol";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";

export function sealRecoveryEnvelope(
  context: TAdminContext,
  history: THistory,
  keys: { encSk: Uint8Array; objSk: Uint8Array },
  password: string,
  secret: Uint8Array,
  now: () => number,
) {
  return p.sealEnvelope(
    {
      vaultId: context.vaultId,
      recoveryEncSk: keys.encSk,
      recoveryObjSk: keys.objSk,
      checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
      sealedAt: BigInt(now()),
    },
    password,
    secret,
  );
}
