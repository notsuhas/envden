import { type IDeviceRecord } from "../members/device.ts";
import { DeviceRecordCodec } from "../members/device.ts";
import { codec, tagged, concat, header } from "../../encoding/binary.ts";

export interface IPairJoiner {
  device: IDeviceRecord;
}

export const PairJoinerCodec = codec<IPairJoiner>(
  (r) => {
    tagged(7, r);

    return { device: DeviceRecordCodec.read(r) };
  },
  (v) => concat(header(7), DeviceRecordCodec.write(v.device)),
);
