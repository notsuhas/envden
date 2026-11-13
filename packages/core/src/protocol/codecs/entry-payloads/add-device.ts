import { type IDeviceRecord } from "../members/device.ts";
import { DeviceRecordCodec } from "../members/device.ts";
import { type IWrap } from "../epochs/wrap.ts";
import { WrapCodec } from "../epochs/wrap.ts";
import { codec, concat } from "../../encoding/binary.ts";

export interface IAddDevice {
  device: IDeviceRecord;
  wrap: IWrap;
}

export const AddDeviceCodec = codec<IAddDevice>(
  (r) => {
    return { device: DeviceRecordCodec.read(r), wrap: WrapCodec.read(r) };
  },
  (v) => concat(DeviceRecordCodec.write(v.device), WrapCodec.write(v.wrap)),
);
