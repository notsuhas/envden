import { prepareRecoveryJoin, type IRecoveryJoin } from "./attempt.ts";
import { resumeRecoveryJoin } from "./resume.ts";

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

async function attemptRecoveryJoin(adapters: TAdapters, options: IRecoveryJoin) {
  const context = await prepareRecoveryJoin(adapters, options);
  const resumed = await resumeRecoveryJoin(adapters, options, context);
  if (resumed) return resumed;
  const { vaultId, code, server, pending, identity, client, history } = context;

  const head = history.headers.at(-1)!;
  const box = new Uint8Array(await (await client.request("/v1/envelope")).arrayBuffer());

  if (!p.equal(p.H("envelope-blob", box), head.body.envelopeHash))
    throw new EnvdenError("INVALID_DATA", "Envelope hash mismatch");

  const envelope = openRecoveryEnvelope(box, code, vaultId);
  code.fill(0);
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

function openRecoveryEnvelope(box: Uint8Array, code: Uint8Array, vaultId: Uint8Array) {
  try {
    return p.openEnvelope(box, code, vaultId);
  } catch (cause) {
    if (cause instanceof EnvdenError && cause.code !== "INVALID_DATA") throw cause;

    throw new EnvdenError("INVALID_DATA", "Invalid recovery envelope", { cause });
  }
}

function lockedrecoveryJoin(...args: Parameters<typeof attemptRecoveryJoin>) {
  return retryHead(() => attemptRecoveryJoin(...args));
}

export function recoveryJoin(...args: Parameters<typeof lockedrecoveryJoin>) {
  return withStateLock(args[0].home, () => lockedrecoveryJoin(...args));
}
