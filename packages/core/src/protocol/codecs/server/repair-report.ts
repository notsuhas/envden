import { codec, tagged, b32, list, compare, b16, concat, header } from "../../encoding/binary.ts";

export interface IRepairReport {
  vaultId: Uint8Array;
  repairId: Uint8Array;
  head: Uint8Array;
  blobs: Uint8Array[];
  signer: Uint8Array;
}

export const RepairReportCodec = codec<IRepairReport>(
  (r) => {
    tagged(11, r);

    return {
      vaultId: b32.read(r),
      repairId: b32.read(r),
      head: b32.read(r),
      blobs: list(b32, compare).read(r),
      signer: b16.read(r),
    };
  },
  (v) =>
    concat(
      header(11),
      b32.write(v.vaultId),
      b32.write(v.repairId),
      b32.write(v.head),
      list(b32, compare).write(v.blobs),
      b16.write(v.signer),
    ),
);
