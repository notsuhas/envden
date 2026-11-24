import * as p from "@envden/core/protocol";
import type { TGenesis } from "./genesis.ts";
import type { TDeviceIdentity } from "../identity/device.ts";

export function createVaultSwap(
  material: TGenesis,
  identity: TDeviceIdentity,
  code: Uint8Array,
  now: number,
) {
  const envelope = p.sealEnvelope(
    {
      vaultId: material.vaultId,
      recoveryEncSk: material.recoveryKeys.encSk,
      recoveryObjSk: material.recoveryKeys.objSk,
      checkpoint: new Uint8Array(32),
      sealedAt: BigInt(now),
    },
    code,
  );

  const files: p.IFiles = { entries: [] };

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId: material.vaultId,
      seq: 1n,
      op: 0,
      prev: new Uint8Array(32),
      listSeq: 1n,
      listHead: p.objectHash(p.EntryCodec, material.epoch, "entry"),
      epoch: 1,
      keyringHash: p.H("keyring-blob", material.keyring),
      filesHash: p.H("files", p.encode(p.FilesCodec, files)),
      envelopeHash: p.H("envelope-blob", envelope),
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  const swap: p.ISwap = {
    expectedHead: new Uint8Array(32),
    entries: [material.genesis, material.epoch],
    header,
    files,
    keyring: material.keyring,
    envelope,
    proofPub: p.proofPub(code),
    approver: undefined,
  };

  return swap;
}
