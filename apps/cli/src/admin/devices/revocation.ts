import * as p from "@envden/core/protocol";
import type { TAdminContext } from "../shared/context.ts";
import type { THistory } from "../../vault/history.ts";
import { nextEpoch } from "../shared/epoch.ts";
import { adminSwap } from "../shared/swap.ts";

export async function revocationSwap(
  context: TAdminContext,
  history: THistory,
  device: { id: Uint8Array },
  now: number,
) {
  const { change, keyring } = await nextEpoch(context, history, history.state.recovery, device.id);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 2,
      payload: { device: device.id, newRecovery: undefined, change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  return adminSwap(history, context.identity, 4, now, { entries: [entry], keyring });
}
