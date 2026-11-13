import {
  compare,
  deviceId,
  generateDeviceKeys,
  generateRecoveryKeys,
  recoveryId,
  signObject,
  EntryCodec,
  objectHash,
  FilesCodec,
  H,
  ManifestHeaderCodec,
  keyCommit,
  sealKeyring,
} from "../../protocol/index.ts";
import type {
  IDeviceRecord,
  IFiles,
  IManifestHeader,
  ISigned,
  TEntryPayload,
} from "../../protocol/index.ts";
import { applyEntry } from "../devices/apply.ts";
import type { IDeviceListState } from "../devices/state.ts";

export const bytes = (n: number, length = 32) => new Uint8Array(length).fill(n);

export function rng(seed = 1) {
  let n = seed;

  return (size: number) =>
    Uint8Array.from({ length: size }, () => {
      n = (n * 1664525 + 1013904223) >>> 0;

      return n >>> 24;
    });
}

export function device(seed: number) {
  const keys = generateDeviceKeys(rng(seed));
  const record: IDeviceRecord = { ...keys, id: deviceId(keys), name: `device-${seed}` };

  return { keys, record };
}

export function fixture() {
  const a = device(1);
  const b = device(2);
  const recoveryKeys = generateRecoveryKeys(rng(3));
  const recovery = { ...recoveryKeys, id: recoveryId(recoveryKeys) };

  const genesis = signObject(
    EntryCodec,
    {
      vaultId: bytes(0),
      parent: bytes(0),
      seq: 0n,
      kind: 0,
      payload: {
        serverPin: bytes(4),
        device: a.record,
        recovery,
        vaultNonce: bytes(5),
        createdAt: 1n,
      },
      signer: a.record.id,
    },
    a.keys.objSk,
    "entry",
  );

  const initial = applyEntry(undefined, genesis);
  if (initial.kind !== "valid") throw new Error("fixture genesis");
  const key = bytes(6);

  const change = (
    state: IDeviceListState,
    devices = [...state.devices.values()],
    nextRecovery = state.recovery,
  ) => ({
    epoch: state.epoch + 1,
    keyCommit: keyCommit(key, state.vaultId, state.epoch + 1),
    wraps: [...devices, nextRecovery]
      .map((d) => ({ recipient: d.id, enc: bytes(7), ct: bytes(8, 48) }))
      .sort((x, y) => compare(x.recipient, y.recipient)),
  });

  const entry = (state: IDeviceListState, payload: TEntryPayload, signer = a) =>
    signObject(
      EntryCodec,
      {
        vaultId: state.vaultId,
        parent: state.head,
        seq: state.seq + 1n,
        ...payload,
        signer: signer.record.id,
      },
      signer.keys.objSk,
      "entry",
    );

  const epoch = entry(initial.state, { kind: 3, payload: { change: change(initial.state) } });
  const result = applyEntry(initial.state, epoch);
  if (result.kind !== "valid") throw new Error("fixture epoch");
  const state = result.state;
  const files: IFiles = { entries: [] };
  const idKey = bytes(9);
  const keyring = sealKeyring({ vaultId: state.vaultId, epoch: 1, idKey, older: [] }, key, rng(10));

  const header = signObject(
    ManifestHeaderCodec,
    {
      vaultId: state.vaultId,
      seq: 1n,
      op: 0,
      prev: bytes(0),
      listSeq: state.seq,
      listHead: state.head,
      epoch: 1,
      keyringHash: H("keyring-blob", keyring),
      filesHash: H("files", FilesCodec.write(files)),
      envelopeHash: bytes(10),
      createdAt: 1n,
      signer: a.record.id,
    },
    a.keys.objSk,
    "manifest",
  );

  const checkpoint = { header, files, state, idKey };

  return {
    a,
    b,
    recovery,
    recoveryKeys,
    genesis,
    epoch,
    state,
    entry,
    change,
    files,
    header,
    checkpoint,
    key,
    keyring,
    idKey,
  };
}

export function signedHeader(
  previous: ISigned<IManifestHeader>,
  changes: Partial<IManifestHeader>,
  signer = device(1),
) {
  return signObject(
    ManifestHeaderCodec,
    {
      ...previous.body,
      seq: previous.body.seq + 1n,
      prev: objectHash(ManifestHeaderCodec, previous, "manifest"),
      ...changes,
    },
    signer.keys.objSk,
    "manifest",
  );
}
