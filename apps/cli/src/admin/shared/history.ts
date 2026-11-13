import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import { binary } from "../../client/encoding.ts";
import { readHistory } from "../../vault/history.ts";
import type { THistory } from "../../vault/history.ts";
import type { ILocalState } from "../../state/model.ts";
import type { TAdminContext } from "./context.ts";

export function checkFloor(local: ILocalState, history: THistory) {
  for (const encoded of local.headers) {
    const stored = p.decode(p.signedCodec(p.ManifestHeaderCodec), binary(encoded));
    const remote = history.headers.find((header) => header.body.seq === stored.body.seq);

    if (!remote)
      throw new EnvdenError("ROLLBACK", "Server is behind this device; run envden server repair");

    if (
      !p.equal(
        p.objectHash(p.ManifestHeaderCodec, stored, "manifest"),
        p.objectHash(p.ManifestHeaderCodec, remote, "manifest"),
      )
    )
      throw new EnvdenError("FORK", "Server history conflicts with stored headers");
  }
}

export async function currentHistory(context: TAdminContext) {
  const history = await readHistory(context.client, context.vaultId);
  checkFloor(context.local, history);

  return history;
}
