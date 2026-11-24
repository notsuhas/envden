import { withStateLock } from "../../state/lock/lock.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { nextEpoch } from "../shared/epoch.ts";
import { adminSwap } from "../shared/swap.ts";
import { commitAdmin } from "../shared/commit.ts";

async function attemptRotateVault(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  const history = await currentHistory(context);
  const { change, keyring } = await nextEpoch(context, history);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      kind: 3,
      payload: { change },
      signer: context.identity.record.id,
    },
    context.identity.keys.objSk,
    "entry",
  );

  await commitAdmin(
    context,
    adminSwap(history, context.identity, 6, now(), { entries: [entry], keyring }),
  );
}

export function rotateVault(...args: Parameters<typeof attemptRotateVault>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptRotateVault(...args)));
}
