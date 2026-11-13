import { type IRecoveryRecord } from "../members/recovery.ts";
import { RecoveryRecordCodec } from "../members/recovery.ts";
import { type IEpochChange } from "../epochs/epoch-change.ts";
import { EpochChangeCodec } from "../epochs/epoch-change.ts";
import { codec, concat } from "../../encoding/binary.ts";

export interface IReplaceRecovery {
  recovery: IRecoveryRecord;
  change: IEpochChange;
}

export const ReplaceRecoveryCodec = codec<IReplaceRecovery>(
  (r) => {
    return { recovery: RecoveryRecordCodec.read(r), change: EpochChangeCodec.read(r) };
  },
  (v) => concat(RecoveryRecordCodec.write(v.recovery), EpochChangeCodec.write(v.change)),
);
