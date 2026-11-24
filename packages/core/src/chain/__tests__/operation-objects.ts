import {
  signObject,
  ManifestHeaderCodec,
  objectHash,
  H,
  FilesCodec,
} from "../../protocol/index.ts";
import type { ISigned, TEntry, ISwap, IManifestHeader, IFiles } from "../../protocol/index.ts";
import type { fixture } from "./fixtures.ts";
import { bytes, signedHeader } from "./fixtures.ts";

export function operationSwap(
  op: number,
  f: ReturnType<typeof fixture>,
  state: ReturnType<typeof fixture>["state"],
  nextState: ReturnType<typeof fixture>["state"],
  previous: ISigned<IManifestHeader>,
  entries: ISigned<TEntry>[],
) {
  const oldEntry = {
    fileId: bytes(20),
    version: 1n,
    epoch: 1,
    state: 1,
    blobHash: bytes(21),
    name: bytes(22),
  };

  const oldFiles = { entries: op === 11 ? [oldEntry] : [] };

  const prior = signObject(
    ManifestHeaderCodec,
    { ...previous.body, filesHash: H("files", FilesCodec.write(oldFiles)) },
    f.a.keys.objSk,
    "manifest",
  );

  const files = [1, 11].includes(op)
    ? {
        entries: [
          {
            ...oldEntry,
            version: 2n,
            name: bytes(32),
            state: op === 11 ? 4 : 1,
            blobHash: op === 11 ? bytes(0) : bytes(23),
          },
        ],
      }
    : undefined;

  const keyring = [4, 5, 6, 7].includes(op) ? bytes(24) : undefined;
  const envelope = [5, 7].includes(op) ? bytes(25) : undefined;

  const header = operationHeader(op, f, prior, nextState, files, keyring, envelope);

  const swap: ISwap = {
    expectedHead: objectHash(ManifestHeaderCodec, prior, "manifest"),
    entries,
    header,
    files,
    keyring,
    envelope,
    proofPub: [5, 7].includes(op) ? f.a.record.objPub : undefined,
    approver: op === 2 ? bytes(28) : undefined,
  };

  return { swap, prior, oldFiles, oldEntry, header };
}

function operationHeader(
  op: number,
  f: ReturnType<typeof fixture>,
  prior: ISigned<IManifestHeader>,
  nextState: ReturnType<typeof fixture>["state"],
  files: IFiles | undefined,
  keyring: Uint8Array | undefined,
  envelope: Uint8Array | undefined,
) {
  return signedHeader(
    prior,
    {
      op,
      listSeq: nextState.seq,
      listHead: nextState.head,
      epoch: nextState.epoch,
      filesHash: files ? H("files", FilesCodec.write(files)) : prior.body.filesHash,
      keyringHash: keyring ? H("keyring-blob", keyring) : prior.body.keyringHash,
      envelopeHash: envelope ? H("envelope-blob", envelope) : prior.body.envelopeHash,
      signer: op === 3 ? f.b.record.id : f.a.record.id,
    },
    op === 3 ? f.b : f.a,
  );
}
