import { codec, b32, concat } from "../../encoding/binary.ts";

export interface IRepairDone {
  repairId: Uint8Array;
  restoredHead: Uint8Array;
}

export const RepairDoneCodec = codec<IRepairDone>(
  (r) => {
    return { repairId: b32.read(r), restoredHead: b32.read(r) };
  },
  (v) => concat(b32.write(v.repairId), b32.write(v.restoredHead)),
);
