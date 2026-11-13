import {
  codec,
  tagged,
  b32,
  u64,
  u8,
  u32,
  b16,
  concat,
  header,
  requireValue,
} from "../../encoding/binary.ts";

export interface IManifestHeader {
  vaultId: Uint8Array;
  seq: bigint;
  op: number;
  prev: Uint8Array;
  listSeq: bigint;
  listHead: Uint8Array;
  epoch: number;
  keyringHash: Uint8Array;
  filesHash: Uint8Array;
  envelopeHash: Uint8Array;
  createdAt: bigint;
  signer: Uint8Array;
}

export const ManifestHeaderCodec = codec<IManifestHeader>(
  (r) => {
    tagged(2, r);

    return {
      vaultId: b32.read(r),
      seq: u64.read(r),
      op: u8.read(r),
      prev: b32.read(r),
      listSeq: u64.read(r),
      listHead: b32.read(r),
      epoch: u32.read(r),
      keyringHash: b32.read(r),
      filesHash: b32.read(r),
      envelopeHash: b32.read(r),
      createdAt: u64.read(r),
      signer: b16.read(r),
    };
  },
  (v) =>
    concat(
      header(2),
      b32.write(v.vaultId),
      u64.write(v.seq),
      u8.write(v.op),
      b32.write(v.prev),
      u64.write(v.listSeq),
      b32.write(v.listHead),
      u32.write(v.epoch),
      b32.write(v.keyringHash),
      b32.write(v.filesHash),
      b32.write(v.envelopeHash),
      u64.write(v.createdAt),
      b16.write(v.signer),
    ),
  (v) => {
    requireValue(v.op <= 12, "Unknown operation");
  },
);
