import { withStateLock } from "../../state/lock/lock.ts";
import { sealRecoveryEnvelope } from "./envelope.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { nextEpoch } from "../shared/epoch.ts";
import { adminSwap } from "../shared/swap.ts";
import { commitAdmin } from "../shared/commit.ts";
import { clearPendingCode, savePendingCode, settlePendingCode } from "./pending.ts";

interface ICodeMaterial {
  keys: ReturnType<typeof p.generateRecoveryKeys>;
  code: Uint8Array;
  show: (code: string) => Promise<void>;
}

async function attemptReplaceCode(
  adapters: TAdapters,
  now: () => number,
  fetcher: TFetch,
  material: ICodeMaterial,
  removed?: Uint8Array,
) {
  const context = await adminContext(adapters, now, fetcher);
  if (await settlePendingCode(context)) return { kind: "finished" as const };

  const history = await currentHistory(context);
  const { keys, code } = material;
  const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
  const { change, keyring } = await nextEpoch(context, history, recovery, removed);

  const entry = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: context.vaultId,
      seq: history.state.seq + 1n,
      parent: history.state.head,
      signer: context.identity.record.id,
      ...(removed
        ? { kind: 2, payload: { device: removed, newRecovery: recovery, change } }
        : { kind: 4, payload: { recovery, change } }),
    },
    context.identity.keys.objSk,
    "entry",
  );

  const swap = adminSwap(history, context.identity, removed ? 5 : 7, now(), {
    entries: [entry],
    keyring,
    envelope: sealRecoveryEnvelope(context, history, keys, code, now),
    proofPub: p.proofPub(code),
  });

  await savePendingCode(context, swap);
  await material.show(p.encodeRecoveryCode(code));
  await commitAdmin(context, swap);
  await clearPendingCode(context);

  return { kind: "replaced" as const };
}

// The code is shown before the swap is sent, and once per call so head retries keep the same code.
export function replaceCode(
  adapters: TAdapters,
  now: () => number,
  onCode: (code: string) => Promise<void>,
  fetcher: TFetch = adapters.fetcher,
  removed?: Uint8Array,
) {
  return withStateLock(adapters.home, async () => {
    const keys = p.generateRecoveryKeys();
    const code = p.generateRecoveryCode();
    let shown = false;

    const show = async (text: string) => {
      if (shown) return;
      await onCode(text);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceCode(adapters, now, fetcher, { keys, code, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      code.fill(0);
    }
  });
}
