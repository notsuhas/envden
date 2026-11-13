import * as p from "@envden/core/protocol";
import type { THistory } from "../../vault/history.ts";
import type { TAdminContext } from "./context.ts";
import { currentMaterial } from "./material.ts";

export async function nextEpoch(
  context: TAdminContext,
  history: THistory,
  recovery = history.state.recovery,
  removed?: Uint8Array,
) {
  const { key, ring } = await currentMaterial(context, history);
  const nextKey = p.randomBytes(32);
  const epoch = history.state.epoch + 1;

  const members = [...history.state.devices.values()].filter(
    (device) => !removed || !p.equal(device.id, removed),
  );

  const wraps = await Promise.all(
    [...members, recovery].map((member) =>
      p.sealWrap(nextKey, context.vaultId, epoch, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const keyring = p.sealKeyring(
    {
      vaultId: context.vaultId,
      epoch,
      idKey: ring.idKey,
      older: [...ring.older, { epoch: ring.epoch, key }],
    },
    nextKey,
  );

  return {
    change: { epoch, keyCommit: p.keyCommit(nextKey, context.vaultId, epoch), wraps },
    keyring,
  };
}
