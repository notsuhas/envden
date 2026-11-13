import { withStateLock } from "../state/lock.ts";
import { currentMaterial } from "../admin/shared/material.ts";
import { checkFloor } from "../admin/shared/history.ts";
import { loadState } from "../state/repository.ts";
import { retryHead } from "../client/retry.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { preparePairing, finishApprover } from "./local.ts";
import { getSlot, putSlot, requireWindow } from "./exchange.ts";
import { binary } from "../client/encoding.ts";
import { readHistory } from "../vault/history.ts";
import { addDeviceSwap } from "../vault/add.ts";

export async function openPairing(client: TClient, pin: Uint8Array) {
  const response = await client.request("/v1/pairing/mailboxes", "POST");
  const mailbox = p.MailboxOpenedSchema.parse(await response.json());
  const local = await preparePairing(pin, mailbox.number);

  return { ...mailbox, ...local };
}

async function lockedapprovePairing(
  adapters: TAdapters,
  client: TClient,
  identity: TDeviceIdentity,
  pin: Uint8Array,
  vaultId: Uint8Array,
  attempt: Awaited<ReturnType<typeof openPairing>>,
  now: () => number,
  wait: (slot: string) => Promise<void>,
  confirm: (name: string) => Promise<boolean>,
) {
  const { number } = attempt;
  requireWindow(attempt.expiresAt, now());
  await wait("KE1");
  const response = await attempt.answer(await getSlot(client, number, "KE1"));
  await putSlot(client, number, "KE2", response.loginResponse);
  await wait("KE3");

  const keys = await finishApprover(
    pin,
    number,
    response.serverLoginState,
    await getSlot(client, number, "KE3"),
  );

  await wait("PairJoiner");

  const candidate = p.openPairJoiner(
    binary(await getSlot(client, number, "PairJoiner")),
    keys.joinerToApprover,
  ).device;

  if (!(await confirm(candidate.name))) {
    await client.request(`/v1/pairing/mailboxes/${number}`, "DELETE");

    return { kind: "declined" as const };
  }

  await retryHead(async () => {
    const history = await readHistory(client, vaultId);

    const local = await loadState(adapters.home);
    if (!local) throw new EnvdenError("NOT_FOUND", "Missing local vault state");
    checkFloor(local, history);

    const { key: epochKey } = await currentMaterial(
      { adapters, local, client, identity, vaultId, now },
      history,
    );

    requireWindow(attempt.expiresAt, now());

    const swap = await addDeviceSwap(
      history,
      candidate,
      identity.record.id,
      identity.keys.objSk,
      epochKey,
      2,
      now(),
      { id: identity.record.id, sk: identity.keys.objSk },
    );

    swap.approver = p.sealPairApprover(
      {
        vaultId,
        serverPin: pin,
        manifestHash: p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
      },
      keys.approverToJoiner,
    );

    const bytes = p.encode(p.SwapCodec, swap);
    await client.request(`/v1/swap?mailbox=${number}`, "POST", bytes);
  });

  keys.approverToJoiner.fill(0);
  keys.joinerToApprover.fill(0);

  return { kind: "paired" as const };
}

export function approvePairing(...args: Parameters<typeof lockedapprovePairing>) {
  return withStateLock(args[0].home, () => lockedapprovePairing(...args));
}
