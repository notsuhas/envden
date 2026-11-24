import { type IDeviceRecord } from "../members/device.ts";
import { DeviceRecordCodec } from "../members/device.ts";
import { codec, tagged, b32, concat, header } from "../../encoding/binary.ts";

export interface IJoinReveal {
  device: IDeviceRecord;
  nonce: Uint8Array;
}

export const JoinRevealCodec = codec<IJoinReveal>(
  (r) => {
    tagged(7, r);

    return { device: DeviceRecordCodec.read(r), nonce: b32.read(r) };
  },
  (v) => concat(header(7), DeviceRecordCodec.write(v.device), b32.write(v.nonce)),
);
