import { withStateLock } from "../../state/lock/lock.ts";
import { sealRecoveryEnvelope } from "./envelope.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { registerPassword } from "../../session/registration.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { nextEpoch } from "../shared/epoch.ts";
import { adminSwap } from "../shared/swap.ts";
import { commitAdmin } from "../shared/commit.ts";

async function attemptResetPassword(
  adapters: TAdapters,
  password: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = fetch,
) {
  const secret = p.decodeSecretKey(kit);
  const keys = p.generateRecoveryKeys();

  try {
    const context = await adminContext(adapters, now, fetcher, (request) =>
      p.signSKProof(secret, request.vaultId, request),
    );

    const history = await currentHistory(context);
    const recovery = { id: p.recoveryId(keys), encPub: keys.encPub, objPub: keys.objPub };
    const { change, keyring } = await nextEpoch(context, history, recovery);

    const entry = p.signObject<p.TEntry>(
      p.EntryCodec,
      {
        vaultId: context.vaultId,
        seq: history.state.seq + 1n,
        parent: history.state.head,
        signer: context.identity.record.id,
        kind: 4,
        payload: { recovery, change },
      },
      context.identity.keys.objSk,
      "entry",
    );

    const record = await registerPassword(context.client, context.vaultId, password);

    const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 9, now(), {
        entries: [entry],
        keyring,
        envelope,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    keys.encSk.fill(0);
    keys.objSk.fill(0);
  }
}

export function resetPassword(...args: Parameters<typeof attemptResetPassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptResetPassword(...args)));
}
