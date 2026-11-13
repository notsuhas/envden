import { type IRecoveryRecord } from "../members/recovery.ts";
import { RecoveryRecordCodec } from "../members/recovery.ts";
import { type IEpochChange } from "../epochs/epoch-change.ts";
import { EpochChangeCodec } from "../epochs/epoch-change.ts";
import { codec, b16, opt, concat } from "../../encoding/binary.ts";

export interface IRemoveDevice {
  device: Uint8Array;
  newRecovery: IRecoveryRecord | undefined;
  change: IEpochChange;
}

export const RemoveDeviceCodec = codec<IRemoveDevice>(
  (r) => {
    return {
      device: b16.read(r),
      newRecovery: opt(RecoveryRecordCodec).read(r),
      change: EpochChangeCodec.read(r),
    };
  },
  (v) =>
    concat(
      b16.write(v.device),
      opt(RecoveryRecordCodec).write(v.newRecovery),
      EpochChangeCodec.write(v.change),
    ),
);
