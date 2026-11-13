import { codec, tagged, b32, u64, concat, header } from "../../encoding/binary.ts";

export interface IEnvelope {
  vaultId: Uint8Array;
  recoveryEncSk: Uint8Array;
  recoveryObjSk: Uint8Array;
  checkpoint: Uint8Array;
  sealedAt: bigint;
}

export const EnvelopeCodec = codec<IEnvelope>(
  (r) => {
    tagged(5, r);

    return {
      vaultId: b32.read(r),
      recoveryEncSk: b32.read(r),
      recoveryObjSk: b32.read(r),
      checkpoint: b32.read(r),
      sealedAt: u64.read(r),
    };
  },
  (v) =>
    concat(
      header(5),
      b32.write(v.vaultId),
      b32.write(v.recoveryEncSk),
      b32.write(v.recoveryObjSk),
      b32.write(v.checkpoint),
      u64.write(v.sealedAt),
    ),
);
