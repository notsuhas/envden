import * as p from "@envden/core/protocol";
import type { TDeviceIdentity } from "../identity/device.ts";

export async function createGenesis(identity: TDeviceIdentity, pin: Uint8Array, now: number) {
  const recoveryKeys = p.generateRecoveryKeys();

  const recovery = {
    id: p.recoveryId(recoveryKeys),
    encPub: recoveryKeys.encPub,
    objPub: recoveryKeys.objPub,
  };

  const genesis = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId: new Uint8Array(32),
      seq: 0n,
      parent: new Uint8Array(32),
      kind: 0,
      payload: {
        serverPin: pin,
        device: identity.record,
        recovery,
        vaultNonce: p.randomBytes(32),
        createdAt: BigInt(now),
      },
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "entry",
  );

  const vaultId = p.objectHash(p.EntryCodec, genesis, "entry");
  const epochKey = p.randomBytes(32);

  const wraps = await Promise.all(
    [identity.record, recovery].map((member) =>
      p.sealWrap(epochKey, vaultId, 1, member.id, member.encPub),
    ),
  );

  wraps.sort((a, b) => p.compare(a.recipient, b.recipient));

  const epoch = p.signObject<p.TEntry>(
    p.EntryCodec,
    {
      vaultId,
      seq: 1n,
      parent: vaultId,
      signer: identity.record.id,
      kind: 3,
      payload: { change: { epoch: 1, keyCommit: p.keyCommit(epochKey, vaultId, 1), wraps } },
    },
    identity.keys.objSk,
    "entry",
  );

  const idKey = p.randomBytes(32);
  const keyring = p.sealKeyring({ vaultId, epoch: 1, idKey, older: [] }, epochKey);

  return { vaultId, genesis, epoch, keyring, epochKey, idKey, recoveryKeys };
}

export type TGenesis = Awaited<ReturnType<typeof createGenesis>>;
