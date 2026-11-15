import { withStateLock } from "../../state/lock/lock.ts";
import { sealRecoveryEnvelope } from "./envelope.ts";
import { retryHead } from "../../client/retry.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";
import type { TFetch } from "../../client/fetch.ts";
import { login } from "../../session/login.ts";
import { registerPassword } from "../../session/registration.ts";
import { adminContext } from "../shared/context.ts";
import { currentHistory } from "../shared/history.ts";
import { nextEpoch } from "../shared/epoch.ts";
import { adminSwap } from "../shared/swap.ts";
import { commitAdmin } from "../shared/commit.ts";
import { clearPendingKit, savePendingKit, settlePendingKit } from "./pending.ts";

export interface IReplacementKit {
  vaultId: string;
  secretKey: string;
  server: string;
}

interface IKitMaterial {
  keys: ReturnType<typeof p.generateRecoveryKeys>;
  secret: Uint8Array;
  show: (kit: IReplacementKit) => Promise<void>;
}

async function attemptReplaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  fetcher: TFetch,
  material: IKitMaterial,
  removed?: Uint8Array,
) {
  const context = await adminContext(adapters, now, fetcher);
  if (await settlePendingKit(context)) return { kind: "finished" as const };

  await login(context.client, context.vaultId, password);
  const history = await currentHistory(context);
  const { keys, secret } = material;
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

  const envelope = await sealRecoveryEnvelope(context, history, keys, password, secret, now);

  const swap = adminSwap(history, context.identity, removed ? 5 : 7, now(), {
    entries: [entry],
    keyring,
    envelope,
    skPub: p.skPub(secret, context.vaultId),
  });

  const kit = {
    vaultId: p.base32(context.vaultId),
    secretKey: p.encodeSecretKey(secret),
    server: context.local.server!.address,
  };

  await savePendingKit(context, swap);
  await material.show(kit);
  await commitAdmin(context, swap);
  await clearPendingKit(context);

  return { kind: "replaced" as const, kit };
}

async function attemptChangePassword(
  adapters: TAdapters,
  oldPassword: string,
  newPassword: string,
  kit: string,
  now: () => number,
  fetcher: TFetch = adapters.fetcher,
) {
  const context = await adminContext(adapters, now, fetcher);
  await login(context.client, context.vaultId, oldPassword);
  const history = await currentHistory(context);
  const box = new Uint8Array(await (await context.client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), history.headers.at(-1)!.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const secret = p.decodeSecretKey(kit);
  const envelope = await p.openEnvelope(box, oldPassword, secret, context.vaultId);

  try {
    const record = await registerPassword(context.client, context.vaultId, newPassword);

    const sealed = await p.sealEnvelope(
      {
        ...envelope,
        checkpoint: p.objectHash(p.ManifestHeaderCodec, history.headers.at(-1)!, "manifest"),
        sealedAt: BigInt(now()),
      },
      newPassword,
      secret,
    );

    await commitAdmin(
      context,
      adminSwap(history, context.identity, 8, now(), {
        envelope: sealed,
        opaqueRecord: new Uint8Array(Buffer.from(record, "base64url")),
      }),
    );
  } finally {
    secret.fill(0);
    envelope.recoveryEncSk.fill(0);
    envelope.recoveryObjSk.fill(0);
  }
}

// The kit is shown before the swap is submitted, and once per call so head retries keep the same secret.
export function replaceKit(
  adapters: TAdapters,
  password: string,
  now: () => number,
  onKit: (kit: IReplacementKit) => Promise<void>,
  fetcher: TFetch = adapters.fetcher,
  removed?: Uint8Array,
) {
  return withStateLock(adapters.home, async () => {
    const keys = p.generateRecoveryKeys();
    const secret = p.randomBytes(16);
    let shown = false;

    const show = async (kit: IReplacementKit) => {
      if (shown) return;
      await onKit(kit);
      shown = true;
    };

    try {
      return await retryHead(() =>
        attemptReplaceKit(adapters, password, now, fetcher, { keys, secret, show }, removed),
      );
    } finally {
      keys.encSk.fill(0);
      keys.objSk.fill(0);
      secret.fill(0);
    }
  });
}

export function changePassword(...args: Parameters<typeof attemptChangePassword>) {
  return withStateLock(args[0].home, () => retryHead(() => attemptChangePassword(...args)));
}
