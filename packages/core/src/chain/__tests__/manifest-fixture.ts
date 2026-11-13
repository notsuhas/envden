import {
  base32,
  EntryCodec,
  FilesCodec,
  H,
  ManifestHeaderCodec,
  objectHash,
  sealKeyring,
} from "../../protocol/index.ts";
import type { IFiles, IManifestHeader, ISigned, TEntry } from "../../protocol/index.ts";
import type { IChainSource } from "../manifests/source.ts";
import { bytes, fixture, rng, signedHeader } from "./fixtures.ts";

export function manifestFixture() {
  const f = fixture();
  const headers = new Map<string, ISigned<IManifestHeader>>();
  const entries = new Map<string, ISigned<TEntry>>();
  const lists = new Map<string, IFiles>();
  const keyrings = new Map<string, Uint8Array>();
  headers.set(base32(objectHash(ManifestHeaderCodec, f.header, "manifest")), f.header);
  lists.set(base32(f.header.body.filesHash), f.files);

  const source: IChainSource = {
    header: (h) => headers.get(base32(h)),
    entry: (h) => entries.get(base32(h)),
    files: (h) => lists.get(base32(h)),
    keyring: (h) => keyrings.get(base32(h)),
    epochKey: () => f.key,
  };

  const file = {
    fileId: bytes(30),
    version: 1n,
    epoch: 1,
    state: 1,
    blobHash: bytes(31),
    name: bytes(32),
  };

  function push(previous = f.header, files: IFiles = { entries: [file] }, op = 1) {
    const filesHash = H("files", FilesCodec.write(files));
    const header = signedHeader(previous, { op, filesHash });
    lists.set(base32(filesHash), files);
    headers.set(base32(objectHash(ManifestHeaderCodec, header, "manifest")), header);

    return header;
  }

  function rotate(previous = f.header) {
    const entry = f.entry(f.state, { kind: 3, payload: { change: f.change(f.state) } });
    const listHead = objectHash(EntryCodec, entry, "entry");
    entries.set(base32(listHead), entry);

    const box = sealKeyring(
      { vaultId: f.state.vaultId, epoch: 2, idKey: f.idKey, older: [{ epoch: 1, key: f.key }] },
      f.key,
      rng(33),
    );

    const keyringHash = H("keyring-blob", box);
    keyrings.set(base32(keyringHash), box);

    const header = signedHeader(previous, {
      op: 6,
      epoch: 2,
      listSeq: entry.body.seq,
      listHead,
      keyringHash,
    });

    headers.set(base32(objectHash(ManifestHeaderCodec, header, "manifest")), header);

    return header;
  }

  const acceptInput = (head: ISigned<IManifestHeader>) => ({
    checkpoint: f.checkpoint,
    head,
    storedHeaders: [f.header],
    source,
    localFileIds: new Set([base32(file.fileId)]),
  });

  return { ...f, source, headers, entries, lists, keyrings, file, push, rotate, acceptInput };
}
