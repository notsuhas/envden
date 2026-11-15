import { codec, b16, b32, concat, requireValue, compare } from "../../encoding/binary.ts";
import { str } from "../../encoding/strings.ts";
import { deviceId } from "../../keys/identifiers.ts";
import { validateEdPublic, validateEncPublic } from "../../keys/validation.ts";
import { isDeviceName } from "./device-name.ts";

export interface IDeviceRecord {
  id: Uint8Array;
  name: string;
  encPub: Uint8Array;
  objPub: Uint8Array;
  reqPub: Uint8Array;
}

export const DeviceRecordCodec = codec<IDeviceRecord>(
  (r) => {
    return {
      id: b16.read(r),
      name: str.read(r),
      encPub: b32.read(r),
      objPub: b32.read(r),
      reqPub: b32.read(r),
    };
  },
  (v) =>
    concat(
      b16.write(v.id),
      str.write(v.name),
      b32.write(v.encPub),
      b32.write(v.objPub),
      b32.write(v.reqPub),
    ),
  (v) => {
    requireValue(isDeviceName(v.name), "Invalid device name");

    validateEncPublic(v.encPub);
    validateEdPublic(v.objPub);
    validateEdPublic(v.reqPub);
    requireValue(compare(v.id, deviceId(v)) === 0, "Device ID mismatch");
  },
);
