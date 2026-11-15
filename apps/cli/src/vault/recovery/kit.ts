import { prepareKitJoin, type IKitJoin } from "./attempt.ts";
import { resumeKitJoin } from "./resume.ts";

import { rm } from "node:fs/promises";

import { withStateLock } from "../../state/lock/lock.ts";
import { recoveryEpochKey } from "./key.ts";
import { adoptRejoin, finishRejoinIdentity } from "../../admin/rejoin/classify.ts";
import { retryHead } from "../../client/retry.ts";

import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../../adapters.ts";

import { readHistory } from "../history.ts";
import { addDeviceSwap } from "../add.ts";
import { namedForList } from "../named.ts";
import { acceptJoin } from "../join/accept.ts";

async function attemptKitJoin(adapters: TAdapters, options: IKitJoin) {
  const context = await prepareKitJoin(adapters, options);
  const resumed = await resumeKitJoin(adapters, options, context);
  if (resumed) return resumed;
  const { vaultId, server, pending, identity, client, history } = context;
  const secret = p.decodeSecretKey(options.secretKey);

  const head = history.headers.at(-1)!;
  const box = new Uint8Array(await (await client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const envelope = await p
    .openEnvelope(box, options.password, secret, vaultId)
    .catch((cause: unknown) => {
      if (cause instanceof EnvdenError) throw cause;

      throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
    });

  secret.fill(0);
  const recoveryKeys = { encSk: envelope.recoveryEncSk, objSk: envelope.recoveryObjSk };

  try {
    const recovery = history.state.recovery;
    const epochKey = await recoveryEpochKey(history, envelope, recoveryKeys, vaultId);

    const swap = await addDeviceSwap(
      history,
      namedForList(identity.record, history),
      recovery.id,
      recoveryKeys.objSk,
      epochKey,
      3,
      options.now(),
      { id: identity.record.id, sk: identity.keys.objSk },
    );

    if (!p.verifyObject(p.EntryCodec, swap.entries[0]!, recovery.objPub, "entry").ok)
      throw new EnvdenError("INVALID_DATA", "Recovery key is no longer current");

    await client.request("/v1/swap", "POST", p.encode(p.SwapCodec, swap));
    const updated = await readHistory(client, vaultId);

    if (options.rejoin) await adoptRejoin(adapters, updated);

    const accepted = await acceptJoin(
      adapters,
      client,
      identity,
      options.address,
      server.pin,
      updated,
      p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
    );

    if (options.rejoin) await finishRejoinIdentity(adapters);

    await rm(pending, { force: true });

    return accepted;
  } finally {
    recoveryKeys.encSk.fill(0);
    recoveryKeys.objSk.fill(0);
  }
}

function lockedkitJoin(...args: Parameters<typeof attemptKitJoin>) {
  return retryHead(() => attemptKitJoin(...args));
}

export function kitJoin(...args: Parameters<typeof lockedkitJoin>) {
  return withStateLock(args[0].home, () => lockedkitJoin(...args));
}
