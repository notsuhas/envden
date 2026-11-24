import { saveApproval, submitApproval } from "./persistence/submission.ts";
import { withStateLock } from "../state/lock/lock.ts";
import { currentMaterial } from "../admin/shared/material.ts";
import { checkFloor } from "../admin/shared/history.ts";
import { loadState } from "../state/store/repository.ts";
import { retryHead } from "../client/retry.ts";
import * as p from "@envden/core/protocol";
import { EnvdenError } from "@envden/core/errors";
import type { TAdapters } from "../adapters.ts";
import type { TClient } from "../client/request.ts";
import type { TDeviceIdentity } from "../identity/device.ts";
import { cancelRequest, putSlot, requestDeadline } from "./exchange.ts";
import { pauseBriefly, waitMessage, type TPause } from "./wait.ts";
import { binary, text } from "../client/encoding.ts";
import { readHistory } from "../vault/history.ts";
import { addDeviceSwap } from "../vault/add.ts";
import { namedForList } from "../vault/named.ts";

export type TJoinRequest = ReturnType<typeof p.JoinRequestsSchema.parse>["requests"][number];

interface IApprover {
  adapters: TAdapters;
  client: TClient;
  identity: TDeviceIdentity;
  pin: Uint8Array;
  vaultId: Uint8Array;
  now: () => number;
}

export interface IApproverInteraction {
  confirm: (message: string) => Promise<boolean>;
  report: (message: string) => void;
  pause?: TPause;
}

export async function joinRequests(client: TClient) {
  const response = await client.request("/v1/join-requests");

  return p.JoinRequestsSchema.parse(await response.json()).requests;
}

// The offer claims the request; the commit listed before it binds whatever the joiner reveals.
export async function approveJoin(
  approver: IApprover,
  request: TJoinRequest,
  interaction: IApproverInteraction,
) {
  const { client, pin, vaultId, now } = approver;
  const expiresAt = requestDeadline(request.expiresAt, now());
  const nonce = p.randomBytes(32);
  const offer = p.encode(p.JoinOfferCodec, { vaultId, nonce });
  await putSlot(client, request.number, "offer", text(offer));
  let committed = false;

  try {
    interaction.report("Waiting for the new device to show its words");
    const path = `/v1/join-requests/${request.number}/reveal`;
    const pause = interaction.pause ?? pauseBriefly;

    const reveal = p.decode(
      p.JoinRevealCodec,
      binary(await waitMessage(client, path, now, expiresAt, pause)),
    );

    if (!p.opensCommit(binary(request.commit), pin, reveal.device, reveal.nonce))
      throw new EnvdenError(
        "INVALID_DATA",
        "The join request was tampered with, so it was cancelled",
      );

    const proposed = namedForList(reveal.device, await readHistory(client, vaultId));

    const words = p
      .joinWords({
        vaultId,
        pin,
        device: reveal.device,
        joinerNonce: reveal.nonce,
        approverNonce: nonce,
      })
      .join(" ");

    const question = `${proposed.name} wants to join. Words: ${words}. Do they match the other screen?`;
    if (!(await interaction.confirm(question))) return { kind: "declined" as const };

    const name = await commitApproval(approver, request.number, reveal.device, expiresAt);
    committed = true;

    return { kind: "approved" as const, name };
  } finally {
    if (!committed) await cancelRequest(client, request.number);
  }
}

// A lost compare-and-swap rebuilds the entry, name and wrap against the new head.
function commitApproval(
  approver: IApprover,
  number: number,
  device: p.IDeviceRecord,
  expiresAt: number,
) {
  const { adapters, client, identity, pin, vaultId, now } = approver;

  return withStateLock(adapters.home, () =>
    retryHead(async () => {
      const history = await readHistory(client, vaultId);
      const local = await loadState(adapters.home);
      if (!local) throw new EnvdenError("NOT_FOUND", "Missing local vault state");
      checkFloor(local, history);

      const { key: epochKey } = await currentMaterial(
        { adapters, local, client, identity, vaultId, now },
        history,
      );

      requestDeadline(expiresAt, now());
      const committed = namedForList(device, history);

      const swap = await addDeviceSwap(
        history,
        committed,
        identity.record.id,
        identity.keys.objSk,
        epochKey,
        2,
        now(),
        { id: identity.record.id, sk: identity.keys.objSk },
      );

      swap.approver = p.encode(p.JoinApprovedCodec, {
        vaultId,
        serverPin: pin,
        manifestHash: p.objectHash(p.ManifestHeaderCodec, swap.header, "manifest"),
      });

      await saveApproval(adapters, number, p.encode(p.SwapCodec, swap));
      await submitApproval(adapters, client, vaultId);

      return committed.name;
    }),
  );
}
