import { codec, b32, u64, u32, u8, bytes, concat, requireValue } from "../../encoding/binary.ts";

export interface IFileEntry {
  fileId: Uint8Array;
  version: bigint;
  epoch: number;
  state: number;
  blobHash: Uint8Array;
  name: Uint8Array;
}

export const FileEntryCodec = codec<IFileEntry>(
  (r) => {
    return {
      fileId: b32.read(r),
      version: u64.read(r),
      epoch: u32.read(r),
      state: u8.read(r),
      blobHash: b32.read(r),
      name: bytes.read(r),
    };
  },
  (v) =>
    concat(
      b32.write(v.fileId),
      u64.write(v.version),
      u32.write(v.epoch),
      u8.write(v.state),
      b32.write(v.blobHash),
      bytes.write(v.name),
    ),
  (v) => {
    requireValue(v.state >= 1 && v.state <= 4, "Unknown file state");
    requireValue(v.version >= 1n && v.epoch >= 1);

    requireValue(
      (v.state === 2 || v.state === 4) === v.blobHash.every((b) => b === 0),
      "Blob hash does not match file state",
    );
  },
);
