import * as p from "@envden/core/protocol";
import type { vaultFixture } from "./vault-fixture.ts";

export function operationSwap(
  f: Awaited<ReturnType<typeof vaultFixture>>,
  op: number,
  state: Awaited<ReturnType<typeof vaultFixture>>["state"],
  previous: p.ISigned<p.IManifestHeader>,
) {
  const recoveryKeys = p.generateRecoveryKeys();

  const recovery = {
    id: p.recoveryId(recoveryKeys),
    encPub: recoveryKeys.encPub,
    objPub: recoveryKeys.objPub,
  };

  const nextRecovery = [5, 7, 9].includes(op) ? recovery : state.recovery;

  const devices = [...state.devices.values()].filter(
    (d) => ![4, 5].includes(op) || !p.equal(d.id, f.b.record.id),
  );

  const change = {
    epoch: state.epoch + 1,
    keyCommit: p.randomBytes(32),
    wraps: [...devices, nextRecovery]
      .map((d) => ({ recipient: d.id, enc: p.randomBytes(32), ct: p.randomBytes(48) }))
      .sort((a, b) => p.compare(a.recipient, b.recipient)),
  };

  const entries = operationEntries(f, op, state, recovery, change);

  const keyring = op !== 8 ? p.randomBytes(64) : undefined;
  const envelope = [5, 7, 8, 9].includes(op) ? p.randomBytes(64) : undefined;

  const swap = f.next(
    previous,
    {
      op,
      epoch: op === 8 ? state.epoch : change.epoch,
      listSeq: entries[0]?.body.seq ?? state.seq,
      listHead: entries[0] ? p.objectHash(p.EntryCodec, entries[0], "entry") : state.head,
      keyringHash: keyring ? p.H("keyring-blob", keyring) : previous.body.keyringHash,
      envelopeHash: envelope ? p.H("envelope-blob", envelope) : previous.body.envelopeHash,
    },
    entries,
  );

  swap.keyring = keyring;
  swap.envelope = envelope;
  swap.skPub = [5, 7].includes(op) ? p.generateRecoveryKeys().objPub : undefined;
  swap.opaqueRecord = [8, 9].includes(op) ? p.randomBytes(192) : undefined;

  return swap;
}

function operationEntries(
  f: Awaited<ReturnType<typeof vaultFixture>>,
  op: number,
  state: Awaited<ReturnType<typeof vaultFixture>>["state"],
  recovery: p.IRecoveryRecord,
  change: p.IEpochChange,
) {
  let entries: p.ISigned<p.TEntry>[] = [];

  if (op !== 8) {
    const payload: p.TEntryPayload =
      op === 4 || op === 5
        ? {
            kind: 2,
            payload: {
              device: f.b.record.id,
              newRecovery: op === 5 ? recovery : undefined,
              change,
            },
          }
        : op === 6
          ? { kind: 3, payload: { change } }
          : { kind: 4, payload: { recovery, change } };

    entries = [
      p.signObject(
        p.EntryCodec,
        {
          vaultId: f.vaultId,
          seq: state.seq + 1n,
          parent: state.head,
          ...payload,
          signer: f.a.record.id,
        },
        f.a.keys.objSk,
        "entry",
      ),
    ];
  }

  return entries;
}
