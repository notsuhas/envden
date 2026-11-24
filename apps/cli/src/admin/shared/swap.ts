import * as p from "@envden/core/protocol";
import type { THistory } from "../../vault/history.ts";
import type { TDeviceIdentity } from "../../identity/device.ts";

export function adminSwap(
  history: THistory,
  identity: TDeviceIdentity,
  op: p.IManifestHeader["op"],
  now: number,
  fields: Partial<Omit<p.ISwap, "expectedHead" | "header">> = {},
): p.ISwap {
  const before = history.headers.at(-1)!;
  const expectedHead = p.objectHash(p.ManifestHeaderCodec, before, "manifest");
  const entries = fields.entries ?? [];
  const last = entries.at(-1);
  const changed = last?.body;

  const epoch =
    changed && (changed.kind === 2 || changed.kind === 3 || changed.kind === 4)
      ? changed.payload.change.epoch
      : before.body.epoch;

  const header = p.signObject(
    p.ManifestHeaderCodec,
    {
      ...before.body,
      seq: before.body.seq + 1n,
      prev: expectedHead,
      op,
      epoch,
      listSeq: last?.body.seq ?? before.body.listSeq,
      listHead: last ? p.objectHash(p.EntryCodec, last, "entry") : before.body.listHead,
      keyringHash: fields.keyring ? p.H("keyring-blob", fields.keyring) : before.body.keyringHash,
      envelopeHash: fields.envelope
        ? p.H("envelope-blob", fields.envelope)
        : before.body.envelopeHash,
      filesHash: fields.files
        ? p.H("files", p.encode(p.FilesCodec, fields.files))
        : before.body.filesHash,
      createdAt: BigInt(now),
      signer: identity.record.id,
    },
    identity.keys.objSk,
    "manifest",
  );

  return {
    expectedHead,
    header,
    entries,
    files: undefined,
    keyring: undefined,
    envelope: undefined,
    proofPub: undefined,
    approver: undefined,
    ...fields,
  };
}
