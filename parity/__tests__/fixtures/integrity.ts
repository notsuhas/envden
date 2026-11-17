import * as p from "@envden/core/protocol";
import { applyEntry } from "@envden/core/chain";

export function integrityFixture(seed: number, content = "SECRET=fixture\n") {
  let next = seed;

  const rng = (size: number) =>
    Uint8Array.from({ length: size }, () => (next = (next * 1664525 + 1013904223) >>> 0) >>> 24);

  const keys = p.generateDeviceKeys(rng);
  const recovery = p.generateRecoveryKeys(rng);

  const record = {
    id: p.deviceId(keys),
    name: "fixture",
    encPub: keys.encPub,
    objPub: keys.objPub,
    reqPub: keys.reqPub,
  };

  const genesis = p.signObject(
    p.EntryCodec,
    {
      vaultId: new Uint8Array(32),
      parent: new Uint8Array(32),
      seq: 0n,
      signer: record.id,
      kind: 0,
      payload: {
        device: record,
        recovery: { id: p.recoveryId(recovery), encPub: recovery.encPub, objPub: recovery.objPub },
        vaultNonce: rng(32),
        serverPin: rng(32),
        createdAt: 1n,
      },
    },
    keys.objSk,
    "entry",
  );

  const initial = applyEntry(undefined, genesis);
  if (initial.kind !== "valid") throw new Error("fixture genesis");
  const key = rng(32);

  const epoch = p.signObject(
    p.EntryCodec,
    {
      vaultId: initial.state.vaultId,
      parent: initial.state.head,
      seq: 1n,
      signer: record.id,
      kind: 3,
      payload: {
        change: {
          epoch: 1,
          keyCommit: p.keyCommit(key, initial.state.vaultId, 1),
          wraps: [record.id, p.recoveryId(recovery)]
            .sort(p.compare)
            .map((recipient) => ({ recipient, enc: rng(32), ct: rng(48) })),
        },
      },
    },
    keys.objSk,
    "entry",
  );

  const at = applyEntry(initial.state, epoch);
  if (at.kind !== "valid") throw new Error("fixture epoch");
  const idKey = rng(32);

  const context = {
    vaultId: at.state.vaultId,
    epoch: 1,
    fileId: p.fileId(idKey, "repo", ".env"),
    version: 1n,
  };

  const name = { repoId: "repo", path: ".env" };

  const blob = p.sealFile(
    { ...name, content: new TextEncoder().encode(content) },
    key,
    context,
    rng,
  );

  const files = p.encode(p.FilesCodec, {
    entries: [
      {
        fileId: context.fileId,
        epoch: 1,
        version: 1n,
        state: 1,
        blobHash: p.H("blob", blob),
        name: p.sealFileName(name, key, context, rng),
      },
    ],
  });

  const keyring = p.sealKeyring(
    { vaultId: at.state.vaultId, epoch: 1, idKey, older: [] },
    key,
    rng,
  );

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      vaultId: at.state.vaultId,
      seq: 1n,
      op: 0,
      prev: new Uint8Array(32),
      listSeq: 1n,
      listHead: at.state.head,
      epoch: 1,
      keyringHash: p.H("keyring-blob", keyring),
      filesHash: p.H("files", files),
      envelopeHash: rng(32),
      createdAt: 1n,
      signer: record.id,
    },
    keys.objSk,
    "manifest",
  );

  return {
    genesis,
    epoch,
    header,
    blob,
    files,
    keyring,
    key,
    idKey,
    state: at.state,
    signingKey: keys.objSk,
  };
}
