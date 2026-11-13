import { type IDeviceRecord } from "../members/device.ts";
import { DeviceRecordCodec } from "../members/device.ts";
import { type IRecoveryRecord } from "../members/recovery.ts";
import { RecoveryRecordCodec } from "../members/recovery.ts";
import { codec, b32, u64, concat } from "../../encoding/binary.ts";

export interface IGenesis {
  serverPin: Uint8Array;
  device: IDeviceRecord;
  recovery: IRecoveryRecord;
  vaultNonce: Uint8Array;
  createdAt: bigint;
}

export const GenesisCodec = codec<IGenesis>(
  (r) => {
    return {
      serverPin: b32.read(r),
      device: DeviceRecordCodec.read(r),
      recovery: RecoveryRecordCodec.read(r),
      vaultNonce: b32.read(r),
      createdAt: u64.read(r),
    };
  },
  (v) =>
    concat(
      b32.write(v.serverPin),
      DeviceRecordCodec.write(v.device),
      RecoveryRecordCodec.write(v.recovery),
      b32.write(v.vaultNonce),
      u64.write(v.createdAt),
    ),
);
